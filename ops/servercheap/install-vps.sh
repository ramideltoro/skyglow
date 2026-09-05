#!/usr/bin/env bash
set -euo pipefail

release_archive=${1:-$HOME/skyglow-release.tgz}
release_id=$(date -u +%Y%m%dT%H%M%SZ)
base=$HOME/skyglow
release_dir=$base/releases/$release_id
state=$HOME/.local/share/skyglow
logs=$HOME/.local/state/skyglow

if [[ $EUID -eq 0 ]]; then
  echo "Run this installer as the normal SSH user, not root." >&2
  exit 1
fi
if [[ ! -x /usr/bin/caddy ]]; then
  echo "The VPS must already have /usr/bin/caddy." >&2
  exit 1
fi

mkdir -p "$release_dir" "$state" "$logs"
tar -xzf "$release_archive" -C "$release_dir"
chmod 0755 "$release_dir/ops/start-servercheap.sh" "$release_dir/ops/servercheap-supervisor.py"
HOME=$HOME /usr/bin/caddy validate --config "$release_dir/ops/Caddyfile" --adapter caddyfile

previous_target=$(readlink "$base/current" 2>/dev/null || true)
ln -sfn "releases/$release_id" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"

stop_edge() {
  if [[ -s $state/edge-supervisor.pid ]]; then
    pid=$(cat "$state/edge-supervisor.pid")
    kill "$pid" 2>/dev/null || true
    for _ in {1..30}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
  fi
}

start_edge() {
  nohup python3 "$base/current/ops/servercheap-supervisor.py" edge </dev/null >/dev/null 2>&1 &
}

stop_edge
start_edge

existing_crontab=$(crontab -l 2>/dev/null || true)
if ! grep -Fq '# skyglow' <<<"$existing_crontab"; then
  { printf '%s\n' "$existing_crontab"; printf '%s\n' '@reboot $HOME/skyglow/current/ops/start-servercheap.sh # skyglow'; } | sed '/^$/d' | crontab -
fi

for _ in {1..30}; do
  site_status=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/ || true)
  receiver_status=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/api/session || true)
  if [[ $site_status == 200 && $receiver_status == 200 ]]; then
    rm -f "$release_archive"
    echo "Skyglow edge passed: site=$site_status receiver=$receiver_status"
    exit 0
  fi
  sleep 1
done

stop_edge
if [[ -n $previous_target ]]; then
  ln -sfn "$previous_target" "$base/current.next"
  mv -Tf "$base/current.next" "$base/current"
  start_edge
else
  rm -f "$base/current"
fi
echo "Skyglow edge verification failed; the previous release was restored." >&2
exit 1
