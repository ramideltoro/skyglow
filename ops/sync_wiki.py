#!/usr/bin/env python3
"""Synchronize canonical Skyglow docs and describe the deployed commit."""
from datetime import datetime, timezone
from pathlib import Path
import argparse
import os
import re
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'wiki' / 'skyglow'


def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], check=True, capture_output=True, text=True).stdout.strip()


def safe(value):
    return value.replace('\\', '\\\\').replace('[', '\\[').replace(']', '\\]').replace('<', '&lt;').replace('>', '&gt;').replace('|', '\\|')


def category(path):
    if path.startswith(('app/', 'components/', 'public/', 'lib/')):
        return 'Interface'
    if path.startswith('server/'):
        return 'Receiver and API'
    if path.startswith('ops/'):
        return 'Operations and deployment'
    if path.startswith(('wiki/', 'README', 'CONTRIBUTING', 'SECURITY')):
        return 'Documentation'
    if path.startswith(('.github/', 'package', 'pnpm-', 'requirements')):
        return 'Project and dependencies'
    return 'Other'


parser = argparse.ArgumentParser()
parser.add_argument('wiki_repository')
args = parser.parse_args()
wiki_root = Path(args.wiki_repository).resolve()
if not (wiki_root / '.git').is_dir() or not (wiki_root / 'mkdocs.yml').is_file():
    raise SystemExit('Expected a clone of the documentation repository')
target = wiki_root / 'docs' / 'skyglow'
prior_release = target / 'project' / 'current-release.md'
prior_text = prior_release.read_text() if prior_release.is_file() else ''
match = re.search(r'<!-- release:([0-9a-f]{40}) -->', prior_text)
previous = match.group(1) if match else None

if target.exists():
    history = (target / 'project' / 'release-history.md').read_text() if (target / 'project' / 'release-history.md').is_file() else ''
    shutil.rmtree(target)
else:
    history = ''
shutil.copytree(SOURCE, target)

commit = os.environ.get('GITHUB_SHA') or git('rev-parse', 'HEAD')
if not re.fullmatch(r'[0-9a-f]{40}', commit):
    raise SystemExit('Expected a full lowercase Git commit')
timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
run_id = os.environ.get('GITHUB_RUN_ID')
run_url = f'https://github.com/ramideltoro/skyglow/actions/runs/{run_id}' if run_id else 'https://github.com/ramideltoro/skyglow/actions'

if previous == commit:
    commits = git('show', '-s', '--date=short', '--pretty=%H%x09%ad%x09%s', commit).splitlines()
    paths = []
elif previous:
    commits = git('log', '--date=short', '--pretty=%H%x09%ad%x09%s', f'{previous}..{commit}').splitlines()
    paths = git('diff', '--name-only', previous, commit).splitlines()
else:
    commits = git('show', '-s', '--date=short', '--pretty=%H%x09%ad%x09%s', commit).splitlines()
    paths = git('diff-tree', '--root', '--no-commit-id', '--name-only', '-r', commit).splitlines()
grouped = {}
for path in paths:
    grouped.setdefault(category(path), []).append(path)

lines = [
    '# Current release', '', f'<!-- release:{commit} -->',
    f'**Production commit:** [`{commit[:12]}`](https://github.com/ramideltoro/skyglow/commit/{commit})', '',
    f'**Deployed:** {timestamp}', '', f'**Pipeline:** [GitHub Actions run]({run_url})', '',
    'This commit passed the required quality, tests, dependency security, secret scan, production build, bundle budget, mobile Lighthouse, atomic deployment, and public smoke-test stages.', '',
    '## Included commits', ''
]
for item in commits:
    sha, date, subject = item.split('\t', 2)
    lines.append(f'- [`{sha[:9]}`](https://github.com/ramideltoro/skyglow/commit/{sha}) · {date} · {safe(subject)}')
lines.extend(['', '## Changed areas', ''])
if grouped:
    for name, items in sorted(grouped.items()):
        lines.extend([f'### {name}', '', *[f'- `{safe(path)}`' for path in items], ''])
else:
    lines.append('No file changes were detected relative to the previous documented release.\n')
(target / 'project' / 'current-release.md').write_text('\n'.join(lines).rstrip() + '\n')

header = '# Release history\n\nSuccessful production deployments are recorded here automatically.\n\n| Deployed (UTC) | Commit | Workflow | Summary |\n| --- | --- | --- | --- |\n'
rows = [line for line in history.splitlines() if line.startswith('| 20')]
subject = safe(commits[0].split('\t', 2)[2] if commits else git('show', '-s', '--format=%s', commit))
new_row = f'| {timestamp} | [`{commit[:9]}`](https://github.com/ramideltoro/skyglow/commit/{commit}) | [run]({run_url}) | {subject} |'
rows = [new_row, *[row for row in rows if commit[:9] not in row]][:50]
(target / 'project' / 'release-history.md').write_text(header + '\n'.join(rows) + '\n')
print(f'Synchronized Skyglow documentation for {commit[:12]}')
