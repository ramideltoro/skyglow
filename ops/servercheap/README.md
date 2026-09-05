# Skyglow on ServerCheap

The public site runs on the existing ServerCheap VPS while the Mac continues to own the USB receiver, radio modes, audio encoding, and SQLite archive.

## Traffic path

`iPhone → Cloudflare Tunnel on VPS → Caddy on VPS port 8790 → static files`

Receiver requests use a private reverse SSH tunnel opened by the Mac:

`Caddy /api and /media → VPS localhost:18790 → SSH → Mac localhost:8790`

Neither the Mac nor its receiver API has a public inbound port. The VPS can still serve the interface when the Mac is offline, though login, live data, controls, and audio need the Mac and receiver to be running.

## Deploy

From the Skyglow project directory:

```sh
python3 ops/servercheap/deploy.py 65.75.201.18
```

The deployer installs a macOS LaunchAgent for the auto-reconnecting SSH tunnel, uploads a timestamped static release, validates its Caddy configuration, starts an unprivileged edge process, and verifies both the static site and receiver API. The VPS uses the existing `/usr/bin/caddy`, existing Cloudflare Tunnel, SSH access, and user crontab. It does not need `sudo` and does not change the server's system Caddy configuration.

No additional database, object storage, VPN, paid tunnel, or second VPS is required. Live 48 kbps audio is roughly 22 MB per listener-hour. The Mac must remain powered for antenna collection.
