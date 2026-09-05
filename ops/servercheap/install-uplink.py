#!/usr/bin/env python3
"""Install a persistent Mac-to-ServerCheap reverse SSH tunnel for Skyglow."""
import argparse
import os
import plistlib
import re
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('ssh_target')
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_.@:-]+', args.ssh_target):
    parser.error('SSH target contains unsupported characters.')

label = 'local.skyglow.servercheap-uplink'
service = f'gui/{os.getuid()}/{label}'
logs = Path.home()/'Library/Logs/skyglow-servercheap-uplink.log'
plist = {
    'Label': label,
    'ProgramArguments': [
        '/usr/bin/ssh', '-NT',
        '-o', 'BatchMode=yes',
        '-o', 'ExitOnForwardFailure=yes',
        '-o', 'ServerAliveInterval=30',
        '-o', 'ServerAliveCountMax=3',
        '-o', 'StrictHostKeyChecking=yes',
        '-R', '127.0.0.1:18790:127.0.0.1:8790',
        args.ssh_target,
    ],
    'RunAtLoad': True,
    'KeepAlive': True,
    'ThrottleInterval': 10,
    'StandardOutPath': str(logs),
    'StandardErrorPath': str(logs),
}
path = Path.home()/'Library/LaunchAgents'/f'{label}.plist'
path.parent.mkdir(exist_ok=True)
subprocess.run(['launchctl', 'bootout', service], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
path.write_bytes(plistlib.dumps(plist))
for attempt in range(5):
    result = subprocess.run(
        ['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(path)],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        break
    if attempt == 4:
        raise RuntimeError(result.stderr.strip())
    time.sleep(1)

for _ in range(30):
    check = subprocess.run(
        ['ssh', '-o', 'BatchMode=yes', args.ssh_target,
         "curl -fsS --max-time 3 -H 'Host: skyglow.ramideltoro.com' "
         'http://127.0.0.1:18790/api/session >/dev/null'],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if check.returncode == 0:
        print('Private receiver tunnel is connected.')
        break
    time.sleep(1)
else:
    raise RuntimeError(f'The reverse SSH tunnel did not become ready; see {logs}')
