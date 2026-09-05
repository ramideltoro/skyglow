# Security policy

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/ramideltoro/skyglow/security/advisories/new). Do not open a public issue for a vulnerability that could expose credentials, receiver location, private telemetry, recordings, or remote controls.

## Supported version

The deployed `main` branch is supported. Security fixes are applied to `main` and deployed after the required pipeline succeeds.

## Security boundaries

- The receiver API binds to Mac loopback only.
- The VPS reaches the API through an encrypted reverse SSH tunnel bound to VPS loopback.
- All telemetry, history, audio, settings, captures, and controls require a signed-in session.
- Passwords are stored as salted PBKDF2-SHA256 hashes. Session cookies are HTTP-only, secure on the public site, same-site, revocable, and time limited.
- Host and Origin checks protect state-changing requests. Login attempts are rate limited.
- GitHub Actions uses a dedicated restricted VPS key and a separate wiki deploy key.
