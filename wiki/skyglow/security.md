# Security

Skyglow is a public read-only observatory with one privileged owner account: `sqwak`. Visitors can read live positions, history, aircraft details, current audio, satellite captures, and sensor observations. Only the owner can change settings, operate the radio, manage notifications, or read receiver diagnostics.

## Trust boundaries

```mermaid
flowchart LR
    subgraph Public
      Browser
      CF[Cloudflare]
    end
    subgraph VPS
      Edge[Caddy loopback :8790]
      TunnelPort[SSH loopback :18790]
    end
    subgraph Mac
      API[Python loopback :8790]
      State[(Private state)]
      SDR[USB receiver]
    end
    Browser -->|HTTPS| CF
    CF --> Edge
    Edge -->|static files| Browser
    Edge -->|API/media only| TunnelPort
    TunnelPort -->|encrypted SSH| API
    API --> State
    API --> SDR
```

No receiver API port is exposed on the home router or VPS public interface. The Mac initiates the SSH tunnel and launchd reconnects it after interruption.

## Public and owner flows

```mermaid
sequenceDiagram
    actor Visitor
    actor Owner
    participant Browser
    participant Edge as VPS edge
    participant API as Mac API
    participant Store as Login store
    Visitor->>Browser: Open observatory
    Browser->>API: GET snapshot, history, details, or media
    API-->>Browser: Public read-only response
    Owner->>Browser: Submit sqwak credentials
    Browser->>Edge: POST /api/login + Origin
    Edge->>API: Reverse SSH proxy
    API->>API: Validate Host, Origin, owner name, size, and rate limit
    API->>Store: PBKDF2-SHA256 comparison
    Store-->>API: New random session token
    API-->>Browser: HttpOnly; Secure; SameSite=Strict cookie
    Owner->>Browser: Change a mode or setting
    Browser->>API: Authenticated POST request
    API->>Store: Compare SHA-256 token hash and expiry
    API-->>Browser: Owner-only response
```

The password itself is never stored. Account setup saves a per-account random salt, 600,000 PBKDF2-SHA256 iterations, and the resulting hash. Session files contain hashes of random browser tokens rather than reusable token values.

## Defense layers

```mermaid
flowchart TD
    Request[Incoming request] --> Cloudflare[Cloudflare TLS and network controls]
    Cloudflare --> Host[Host allowlist]
    Host --> Kind{State-changing request?}
    Kind -- Yes --> OriginCheck[Exact Origin check]
    Kind -- No --> PublicRead[Allowlisted read route]
    OriginCheck --> Session[sqwak session authentication]
    Session --> Bounds[Body, numeric, URL, and path bounds]
    PublicRead --> Bounds
    Bounds --> Manager[Serialized receiver manager]
    Manager --> Response[No-store and browser security headers]
```

| Control                    | Purpose                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Login throttling           | Ten failed attempts from one client in five minutes trigger a temporary limit        |
| Host and Origin allowlists | Reject cross-site control submissions and unexpected hostnames                       |
| Secure session cookie      | Prevent JavaScript access, cross-site sending, and plaintext public transport        |
| Single owner identity      | Accept privileged sessions only for the configured `sqwak` account                   |
| Server-side authorization  | Reject every control POST before settings or hardware state can change               |
| POST-only controls         | Prevent links, crawlers, and cached GET requests from changing hardware state        |
| Path confinement           | Prevent media and static routes from escaping their configured roots                 |
| Push URL allowlist         | Limit subscriptions to Apple, Google, and Mozilla push services                      |
| Private loopback links     | Keep the Mac API and VPS receiver port off public interfaces                         |
| Dedicated CI keys          | Separate production and wiki credentials; no owner token is stored in the repository |
| Pinned Actions             | CI references reviewed action commits and Dependabot proposes updates                |

## Repository security

Pull requests run formatting, linting, type checks, receiver tests, dependency review, dependency audits, secret scanning, CodeQL, a production build, bundle budgets, and Lighthouse. GitHub secret scanning and push protection reject supported credential patterns. See the repository [security policy](https://github.com/ramideltoro/skyglow/security/policy) for private reporting.
