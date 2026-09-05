#!/usr/bin/env python3
"""Small unprivileged process supervisor for the Skyglow VPS edge."""
import argparse
import fcntl
import os
import signal
import subprocess
import time
from pathlib import Path

BASE = Path.home()/'skyglow'
STATE = Path.home()/'.local/share/skyglow'
LOGS = Path.home()/'.local/state/skyglow'
child = None
stopping = False


def stop(_signal, _frame):
    global stopping
    stopping = True
    if child and child.poll() is None:
        child.terminate()


def main():
    global child
    parser = argparse.ArgumentParser()
    parser.add_argument('service', choices=('edge',))
    args = parser.parse_args()
    STATE.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(parents=True, exist_ok=True)
    lock = (STATE/(args.service+'.lock')).open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    pid_file = STATE/(args.service+'-supervisor.pid')
    pid_file.write_text(str(os.getpid()))
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    command = ['/usr/bin/caddy', 'run', '--config', str(BASE/'current/ops/Caddyfile'), '--adapter', 'caddyfile']
    env = dict(os.environ, HOME=str(Path.home()))
    try:
        with (LOGS/(args.service+'.log')).open('ab', buffering=0) as log:
            while not stopping:
                child = subprocess.Popen(command, stdout=log, stderr=log, env=env)
                child.wait()
                child = None
                if not stopping:
                    time.sleep(5)
    finally:
        if pid_file.exists() and pid_file.read_text().strip() == str(os.getpid()):
            pid_file.unlink()


if __name__ == '__main__':
    main()
