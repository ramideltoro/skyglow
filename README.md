# Skyglow

Skyglow turns a software-defined radio connected to a Mac into a public, mobile-friendly radio observatory. Anyone can explore nearby aircraft, replay saved flights, listen to an active radio stream, view weather-satellite captures, and inspect compatible wireless sensors. The `sqwak` owner account alone can operate the receiver or change settings.

**Open the observatory:** [skyglow.ramideltoro.com](https://skyglow.ramideltoro.com)

## Using Skyglow

1. Open the site in Safari or another modern browser.
2. Use **Sky** to see live aircraft and photo thumbnails, or **Replay** to review saved flights.
3. Tap any nearby aircraft or overhead alert for its full flight card.
4. The owner can choose **Owner sign in** and authenticate as `sqwak` to unlock receiver and station controls.
5. On iPhone, use Safari’s **Share → Add to Home Screen** for the app-style experience and optional owner alerts.

One USB receiver is shared by every mode. Starting radio, satellite, or sensor reception pauses aircraft reception until the session ends. The Mac and receiver must remain powered and online for live data and controls.

## How it works

The public interface is served from a ServerCheap VPS through Cloudflare. An encrypted reverse SSH tunnel carries public read requests and authenticated owner controls to the receiver service on the Mac. Receiver state, recordings, history, and login state remain on the Mac.

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

Architecture, receiver modes, security, operations, troubleshooting, and release history are in the independent [Skyglow wiki](https://wiki.skyglow.ramideltoro.com). Aircraft receiver documentation is available in the related [Antenna Observatory wiki](https://wiki.antenna.ramideltoro.com).

## License

[MIT](LICENSE)
