# Using Skyglow

## Open it on iPhone

1. Visit [skyglow.ramideltoro.com](https://skyglow.ramideltoro.com) in Safari.
2. Explore the live sky and saved observations without signing in.
3. Open Safari’s **Share** menu and choose **Add to Home Screen**.
4. The owner can choose **Owner sign in**, authenticate as `sqwak`, and enable phone alerts in **Station**.

The Home Screen experience supports safe-area insets, 48-pixel controls, a fixed mobile navigation pattern, native audio controls, dark amber styling, and reduced-motion preferences.

```mermaid
flowchart TD
    Open[Open Skyglow] --> Live[Public read-only observatory]
    Live --> Replay[Review history]
    Live --> Detail[Open aircraft cards]
    Live --> Session{Owner signed in?}
    Session -- No --> Login[Sign in as sqwak]
    Login --> Session
    Session -- Yes --> Station[Open Station]
    Station --> Mode{Choose mode}
    Mode --> Aircraft[Aircraft]
    Mode --> Listen[Listen]
    Mode --> Satellite[Satellite]
    Mode --> Sensors[Sensors]
```

## Main areas

| Area           | Purpose                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| **Sky**        | Current aircraft, map, photo thumbnails, detailed flight cards, and alerts      |
| **Replay**     | Saved positions, day selection, animated trails, and records                    |
| **Station**    | Receiver status, installed tools, account controls, notifications, and sign out |
| **Mode sheet** | Start a timed radio, satellite, or sensor session; return to aircraft           |

## Explore an aircraft

Tap an aircraft marker, nearby-aircraft row, or overhead alert to open its flight card. Nearby and alert rows show the available aircraft photo as a thumbnail and an **AeroGrade** score. The card leads with the larger aircraft photo and, when available, a swipeable gallery with up to five additional attributed photos. An AeroGrade gauge follows, along with the route, current altitude, speed, heading, vertical speed, receiver distance, and signal quality. Registry and operator details appear below the live data. Open **Transponder & navigation** for the squawk, selected altitude and heading, autopilot modes, airspeed variants, message count, and data source when the aircraft broadcasts them.

### Read AeroGrade

AeroGrade is a 0–100 confidence score for the aircraft profile Skyglow can assemble at that moment. The detail card shows every factor behind the score:

| Factor         | Points | What raises it                                                                 |
| -------------- | ------ | ------------------------------------------------------------------------------ |
| **Telemetry**  | 40     | Position, altitude, speed, track, vertical rate, squawk, and navigation fields |
| **Reception**  | 25     | Fresh messages, a fresh position, and a stronger local signal                  |
| **Identity**   | 20     | Callsign, registration, aircraft type, and operator                            |
| **Continuity** | 15     | Direct data source, accumulated messages, and broadcast status fields          |

```mermaid
flowchart LR
    Broadcast[Aircraft broadcast] --> T[Telemetry / 40]
    Antenna[Local antenna] --> R[Reception / 25]
    Registry[Broadcast identity] --> I[Identity / 20]
    Stream[Decoder stream] --> C[Continuity / 15]
    T --> Grade[AeroGrade / 100]
    R --> Grade
    I --> Grade
    C --> Grade
```

The grade measures data quality, not the physical quality of the aircraft. A score can change as the aircraft moves, its signal changes, or more fields arrive. It does not rate airworthiness, maintenance, age, or safety.

The context panel shows the published route distance in nautical and statute miles when both airports are known, plus the decoder’s current message count. Lifetime airframe mileage is not generally public and cannot be inferred from one received flight. Use the official registry and NTSB links for source records rather than treating missing records as evidence of safety.

Research shortcuts open live flight history, ADS-B Exchange, a direct AeroLOPA airline seat-map page, SKYbrary aircraft documentation, PlaneSpotters.net fleet history, FAA registration, and the official NTSB investigation database. The seat-map shortcut appears when Skyglow recognizes a supported airline code; it never routes through a search engine. An airline may operate several cabin configurations for the same model, so use the displayed registration and flight details to select the correct layout. The safety link searches official records; AeroGrade does not calculate or imply a safety rating.

## A receiver session

```mermaid
sequenceDiagram
    actor User
    participant UI as iPhone UI
    participant API as Mac API
    participant Manager as Receiver manager
    participant SDR as USB receiver
    User->>UI: Choose mode and duration
    UI->>API: Authenticated POST /api/mode
    API->>Manager: Validate and switch
    Manager->>SDR: Stop current decoder
    Manager->>SDR: Start selected decoder
    API-->>UI: Mode and deadline
    loop Until deadline
        UI->>API: GET /api/snapshot
        API-->>UI: Status and new results
    end
    Manager->>SDR: Restore aircraft decoder
```

!!! warning "Aircraft history pauses"
Aircraft broadcasts cannot be archived while the single receiver is tuned to another band.

## Listening tips

- Safari requires a tap on the native audio control before playing sound.
- Aircraft voice uses AM and is intermittent. Try an active airport frequency and wait through quiet intervals.
- Tampa NOAA weather at **162.550 MHz FM** is the initial signal-check preset.
- Place the telescopic antenna vertically near a window and move it away from chargers, displays, and USB noise.
- Stop the session or let its timer expire to return to aircraft reception.

## Alerts and owner access

Overhead alerts appear for every visitor. The owner can enable sound while the page is open, and iOS web push requires an iPhone Home Screen installation with iOS 16.4 or later. Live data, aircraft details, history, current audio, and captures are public and read-only. Only `sqwak` can change receiver modes, tune frequencies, start captures or sensor reception, update settings, manage alert behavior and push subscriptions, or read diagnostics. Signing out revokes only the current browser session and leaves the public observatory open.
