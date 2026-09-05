# Skyglow

Skyglow turns a software-defined radio connected to a Mac into a private, mobile-friendly radio observatory. It tracks nearby aircraft, replays saved flights, receives local radio and weather audio, captures supported weather satellites, and discovers compatible wireless sensors.

**Open the observatory:** [skyglow.ramideltoro.com](https://skyglow.ramideltoro.com)

## Using Skyglow

1. Open the site in Safari or another modern browser.
2. Sign in with the account provided by the owner.
3. Use **Live** to see aircraft, **Replay** to review saved flights, or **Station** to choose a receiver mode.
4. On iPhone, use Safari’s **Share → Add to Home Screen** for the app-style experience and optional alerts.

One USB receiver is shared by every mode. Starting radio, satellite, or sensor reception pauses aircraft reception until the session ends. The Mac and receiver must remain powered and online for live data and controls.

## How it works

The public interface is served from a ServerCheap VPS through Cloudflare. An encrypted reverse SSH tunnel carries authenticated API and media requests to the receiver service on the Mac. Receiver coordinates, recordings, history, and login state remain on the Mac.

```mermaid
flowchart LR
    Phone[iPhone or browser] --> Cloudflare[Cloudflare Tunnel]
    Cloudflare --> VPS[Skyglow web edge]
    VPS -->|encrypted reverse SSH| Mac[Mac receiver service]
    Mac --> SDR[USB SDR and antenna]
```

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

The Python receiver tests run with `pnpm test`. Local installation and ServerCheap deployment helpers are in [`ops`](ops). Pull requests must pass formatting, linting, type checks, Python tests, dependency checks, a production build, mobile performance budgets, CodeQL, and secret scanning before deployment.

## Documentation

Architecture, receiver modes, security, operations, troubleshooting, and release history are in the [Skyglow wiki](https://docs.ramideltoro.com/skyglow/).

## License

[MIT](LICENSE)
