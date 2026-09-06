# Using Skyglow

## Open it on iPhone

1. Visit [skyglow.ramideltoro.com](https://skyglow.ramideltoro.com) in Safari.
2. Sign in with the account provided by the owner.
3. Open Safari’s **Share** menu and choose **Add to Home Screen**.
4. Launch the saved app. In **Station**, enable phone alerts if desired.

The Home Screen experience supports safe-area insets, 48-pixel controls, a fixed mobile navigation pattern, native audio controls, dark amber styling, and reduced-motion preferences.

```mermaid
flowchart TD
    Open[Open Skyglow] --> Session{Signed in?}
    Session -- No --> Login[Enter owner-provided account]
    Login --> Session
    Session -- Yes --> Live[Live aircraft]
    Live --> Replay[Review history]
    Live --> Station[Open Station]
    Station --> Mode{Choose mode}
    Mode --> Aircraft[Aircraft]
    Mode --> Listen[Listen]
    Mode --> Satellite[Satellite]
    Mode --> Sensors[Sensors]
```

## Main areas

| Area           | Purpose                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| **Live**       | Current aircraft, map, detailed flight cards, route, photo, and overhead alerts |
| **Replay**     | Saved positions, day selection, animated trails, and records                    |
| **Station**    | Receiver status, installed tools, account controls, notifications, and sign out |
| **Mode sheet** | Start a timed radio, satellite, or sensor session; return to aircraft           |

## Explore an aircraft

Tap an aircraft marker or nearby-aircraft row to open its flight card. The card leads with the aircraft photo and route, followed by current altitude, speed, heading, vertical speed, receiver distance, and signal quality. Registry and operator details appear below the live data. Open **Transponder & navigation** for the squawk, selected altitude and heading, autopilot modes, airspeed variants, message count, and data source when the aircraft broadcasts them.

Research shortcuts open live flight history, ADS-B Exchange, AeroLOPA seat-map results, SKYbrary aircraft documentation, PlaneSpotters.net fleet history, FAA registration, and the official NTSB investigation database. A seat map can differ between aircraft with the same model, so confirm the displayed registration. The safety link searches official records; Skyglow does not calculate or imply a safety rating.

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

## Alerts and privacy

Overhead alerts can sound while the page is open. iOS web push requires an iPhone Home Screen installation and iOS 16.4 or later. All aircraft details, audio, captures, settings, and logs require login. Signing out revokes only the current browser session.
