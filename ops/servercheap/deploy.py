#!/usr/bin/env python3
"""Deploy the public Skyglow edge to ServerCheap and connect its Mac receiver."""
import argparse
import re
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OPS = Path(__file__).parent


def safe_hostname(value):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]{0,252}', value):
        raise argparse.ArgumentTypeError('Enter a valid hostname.')
    return value.rstrip('.')


parser = argparse.ArgumentParser()
parser.add_argument('ssh_target', help='SSH target such as rami@203.0.113.10')
parser.add_argument('--domain', type=safe_hostname, default='skyglow.ramideltoro.com')
parser.add_argument('--skip-uplink', action='store_true', help='Use the receiver tunnel already maintained by the Mac')
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_.@:-]+', args.ssh_target):
    parser.error('SSH target contains unsupported characters.')

client = ROOT/'dist/client'
if not (client/'index.html').is_file():
    parser.error('Build Skyglow before deploying it.')

if not args.skip_uplink:
    subprocess.run(['python3', str(OPS/'install-uplink.py'), args.ssh_target], check=True)

with tempfile.TemporaryDirectory(prefix='skyglow-vps-') as tmp:
    stage = Path(tmp)
    caddy = (OPS/'Caddyfile.template').read_text().replace('__DOMAIN__', args.domain)
    (stage/'Caddyfile').write_text(caddy)
    archive = stage/'skyglow-release.tgz'
    with tarfile.open(archive, 'w:gz') as bundle:
        bundle.add(client, arcname='site')
        bundle.add(stage/'Caddyfile', arcname='ops/Caddyfile')
        bundle.add(OPS/'servercheap-supervisor.py', arcname='ops/servercheap-supervisor.py')
        bundle.add(OPS/'start-servercheap.sh', arcname='ops/start-servercheap.sh')
    remote_archive = args.ssh_target+':skyglow-release.tgz'
    subprocess.run(['scp', str(archive), remote_archive], check=True)
    with (OPS/'install-vps.sh').open('rb') as source:
        subprocess.run(
            ['ssh', args.ssh_target, 'bash', '-s', '--', '$HOME/skyglow-release.tgz'],
            stdin=source,
            check=True,
        )

print(f'Deployed Skyglow to {args.ssh_target}; the Mac remains the receiver host.')
