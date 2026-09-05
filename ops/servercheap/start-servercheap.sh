#!/bin/sh
set -eu
mkdir -p "$HOME/.local/state/skyglow"
nohup python3 "$HOME/skyglow/current/ops/servercheap-supervisor.py" edge </dev/null >/dev/null 2>&1 &
