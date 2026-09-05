#!/usr/bin/env python3
"""Fail on Python advisories except reviewed, short-lived exceptions."""
from datetime import date
from pathlib import Path
import json
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
policy = json.loads((ROOT / 'security' / 'pip-audit-allowlist.json').read_text())
expiry = date.fromisoformat(policy['expires'])
if date.today() >= expiry:
    raise SystemExit(f'Python vulnerability exceptions expired on {expiry.isoformat()}')

result = subprocess.run(
    [sys.executable, '-m', 'pip_audit', '--requirement', str(ROOT / 'server' / 'requirements.txt'), '--format', 'json'],
    capture_output=True,
    text=True,
)
try:
    report = json.loads(result.stdout)
except json.JSONDecodeError:
    print(result.stderr, file=sys.stderr)
    raise SystemExit('pip-audit did not return a JSON report')

found = {
    vulnerability['id']
    for dependency in report.get('dependencies', [])
    for vulnerability in dependency.get('vulns', [])
}
allowed = set(policy['advisories'])
unexpected = found - allowed
if unexpected:
    raise SystemExit('Unreviewed Python advisories: ' + ', '.join(sorted(unexpected)))
stale = allowed - found
if stale:
    raise SystemExit('Remove resolved Python advisory exceptions: ' + ', '.join(sorted(stale)))
print(f'Python audit reviewed {len(found)} temporarily excepted advisories; policy expires {expiry.isoformat()}.')
