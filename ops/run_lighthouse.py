#!/usr/bin/env python3
"""Run a mobile Lighthouse audit against the production static build."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse
import gzip
import json
import mimetypes
import os
import shutil
import statistics
import subprocess
import threading


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'dist' / 'client'
REPORT_DIR = ROOT / '.lighthouseci'
REPORT = REPORT_DIR / 'report.json'
SUMMARY = REPORT_DIR / 'summary.json'
PORT = 4173
RUNS = 3
PUBLIC_SNAPSHOT = {
    'now': 1788566400,
    'local': False,
    'can_control': False,
    'username': '',
    'source_age': 2,
    'settings': {'name': 'Skyglow', 'latitude': 27.95, 'longitude': -82.46, 'alert_nm': 5},
    'receiver': {
        'mode': 'aircraft', 'since': 1788562800, 'until': None, 'switching': False,
        'error': None, 'options': {}, 'audio_ready': False,
    },
    'aircraft': [],
    'stats': {'aircraft_24h': 42, 'first_record': None, 'farthest_nm': 31.2, 'farthest_detail': None},
    'alerts': [],
    'sensors': [],
    'captures': [],
    'orbital': {'passes': [], 'message': 'Pass predictions unavailable in this preview.'},
    'events': [],
    'tools': {},
}
THRESHOLDS = {
    # Lighthouse's simulated mobile score varies with shared-runner CPU load.
    # The bundle budget supplies the deterministic performance guardrail while
    # this floor still rejects material end-user regressions.
    'performance': 0.70,
    'accessibility': 0.90,
    'best-practices': 0.90,
    'seo': 0.90,
}

if not (SITE / 'index.html').is_file():
    raise SystemExit('Production build is missing. Run pnpm build first.')
REPORT_DIR.mkdir(exist_ok=True)
chrome = os.environ.get('CHROME_PATH') or next(
    (
        candidate
        for candidate in (
            shutil.which('google-chrome'),
            shutil.which('chromium'),
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        )
        if candidate and Path(candidate).exists()
    ),
    None,
)
if not chrome:
    raise SystemExit('Chrome or Chromium is required for the Lighthouse stage.')


class ProductionLikeHandler(BaseHTTPRequestHandler):
    """Serve the build with the compression and API bootstrap used in production."""

    def log_message(self, *_args):
        pass

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == '/api/session':
            body = b'{"authenticated":false}'
            content_type = 'application/json'
            cache = 'no-store'
        elif path == '/api/snapshot':
            body = json.dumps(PUBLIC_SNAPSHOT).encode()
            content_type = 'application/json'
            cache = 'no-store'
        elif path == '/api/aircraft-thumbnails':
            body = b'{"photos":{}}'
            content_type = 'application/json'
            cache = 'no-store'
        else:
            target = (SITE / ('index.html' if path == '/' else path.lstrip('/'))).resolve()
            if not target.is_relative_to(SITE.resolve()) or not target.is_file():
                target = SITE / 'index.html'
            body = target.read_bytes()
            content_type = mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
            cache = 'public, max-age=31536000, immutable' if '/_next/static/' in path else 'no-store'
        if 'gzip' in self.headers.get('Accept-Encoding', '') and (
            content_type.startswith(('text/', 'application/javascript', 'application/json'))
        ):
            body = gzip.compress(body, compresslevel=6)
            encoding = 'gzip'
        else:
            encoding = None
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', cache)
        if encoding:
            self.send_header('Content-Encoding', encoding)
            self.send_header('Vary', 'Accept-Encoding')
        self.end_headers()
        self.wfile.write(body)


server = ThreadingHTTPServer(('127.0.0.1', PORT), ProductionLikeHandler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    environment = dict(os.environ, CHROME_PATH=chrome)
    reports = []
    for run in range(1, RUNS + 1):
        output = REPORT_DIR / f'report-{run}.json'
        subprocess.run(
            [
                'pnpm', 'exec', 'lighthouse', f'http://127.0.0.1:{PORT}/',
                '--quiet', '--output=json', f'--output-path={output}',
                '--only-categories=performance,accessibility,best-practices,seo',
                '--chrome-flags=--headless=new --no-sandbox',
            ],
            cwd=ROOT,
            env=environment,
            check=True,
        )
        reports.append(json.loads(output.read_text()))
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)

scores = {
    name: [report['categories'][name]['score'] for report in reports]
    for name in THRESHOLDS
}
medians = {name: statistics.median(values) for name, values in scores.items()}
representative = min(
    reports,
    key=lambda report: abs(report['categories']['performance']['score'] - medians['performance']),
)
REPORT.write_text(json.dumps(representative))
SUMMARY.write_text(json.dumps({'runs': scores, 'medians': medians, 'thresholds': THRESHOLDS}, indent=2) + '\n')
failed = []
for name, minimum in THRESHOLDS.items():
    score = medians[name]
    samples = ', '.join(f'{value:.2f}' for value in scores[name])
    print(f'{name}: median {score:.2f} from [{samples}] (minimum {minimum:.2f})')
    if score < minimum:
        failed.append(f'{name} {score:.2f} < {minimum:.2f}')
if failed:
    raise SystemExit('Lighthouse budget failed: ' + ', '.join(failed))
