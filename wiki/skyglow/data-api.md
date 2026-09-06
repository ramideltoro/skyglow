# Data and API

Skyglow keeps private receiver data on the Mac. The VPS stores only versioned static web assets; it does not contain the account database, aircraft archive, recordings, or precise station settings.

## Data flow

```mermaid
flowchart TD
    Receiver[Active decoder] --> Validate[Parse and validate]
    Validate --> Snapshot[In-memory live snapshot]
    Validate --> SQLite[(SQLite)]
    Validate --> Media[(Capture and HLS files)]
    Snapshot --> API[Authenticated API]
    SQLite --> API
    Media --> MediaRoute[Authenticated /media route]
    API -->|selected ICAO and callsign| ADSBDB[ADSBDB aircraft and route data]
    API -->|selected ICAO| Photos[PlaneSpotters.net photo API]
    API --> Tunnel[Reverse SSH]
    MediaRoute --> Tunnel
    Tunnel --> Browser[iPhone browser]
```

## Stored relationships

```mermaid
erDiagram
    POSITION {
      float t
      string hex
      string flight
      float lat
      float lon
      int altitude
      float speed
      float track
      float distance
    }
    ALERT {
      float t
      string hex
      string detail
    }
    SENSOR {
      string id
      float last
      json data
    }
    SENSOR_HISTORY {
      string id
      float t
      json data
    }
    CAPTURE {
      string id
      float started
      string status
    }
    SENSOR ||--o{ SENSOR_HISTORY : records
    CAPTURE ||--o{ MEDIA_FILE : contains
```

## Retention

| Data                    | Retention                                          | Notes                                                                                 |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Aircraft positions      | 7 days                                             | Replay samples one point per aircraft per minute and caps a response at 60,000 points |
| Range record            | Persistent                                         | Best observed range survives normal history cleanup                                   |
| Sensor history          | 7 days stored; latest 24 hours returned per sensor | Bounded to 150 recent readings per request                                            |
| Satellite capture files | 30 days                                            | Only actual decoder output is shown                                                   |
| Receiver log excerpt    | Current local file                                 | API returns only the most recent bounded text                                         |
| Login sessions          | 30 days maximum                                    | Stored as token hashes and individually revocable                                     |

## HTTP routes

| Method | Route                   | Purpose                                                       | Authentication                    |
| ------ | ----------------------- | ------------------------------------------------------------- | --------------------------------- |
| GET    | `/api/session`          | Report whether the current cookie is valid                    | Public response, no private data  |
| POST   | `/api/login`            | Create a browser session                                      | Host/Origin checks and rate limit |
| POST   | `/api/logout`           | Revoke the current session                                    | Valid Origin                      |
| GET    | `/api/snapshot`         | Live receiver, aircraft, alerts, tools, sensors, and captures | Required                          |
| GET    | `/api/aircraft-details` | Cached aircraft identity, route, and attributed photo         | Required                          |
| GET    | `/api/replay`           | Bounded aircraft history for a time range                     | Required                          |
| GET    | `/api/sensor-history`   | Recent readings for one sensor                                | Required                          |
| GET    | `/api/receiver-log`     | Bounded diagnostic tail                                       | Required                          |
| GET    | `/api/push-key`         | Web Push public key                                           | Required                          |
| POST   | `/api/mode`             | Change or stop a receiver mode                                | Required                          |
| POST   | `/api/settings`         | Update validated station settings                             | Required                          |
| POST   | `/api/push`             | Add or remove an approved push endpoint                       | Required                          |
| GET    | `/media/*`              | HLS segments and capture products                             | Required                          |

## Aircraft enrichment

Opening an aircraft combines two kinds of information:

- **Live broadcast data** comes directly from the local antenna, including altitude, ground speed, heading, vertical rate, squawk, navigation selections, signal strength, and position age.
- **Reference data** comes from ADSBDB and PlaneSpotters.net, including registration, model, operator, route, airports, and an attributed aircraft photo when one is available.

Skyglow sends only the selected ICAO address and callsign to these services. Aircraft identity responses are cached for seven days, routes for six hours, and photo lookups for one day. Failed lookups use a five-minute cache so an unavailable provider cannot delay every refresh. Returned image and attribution links must use an allowlisted HTTPS host.

## Replay sampling

```mermaid
flowchart LR
    Raw[Positions about every 10 s] --> Window[Selected time window]
    Window --> Group[One point / aircraft / minute]
    Group --> Limit[60,000-point cap]
    Limit --> Trails[Ten-minute animated trails]
    Trails --> Gap[Do not join gaps over five minutes]
```

Inputs are range checked, JSON bodies are size limited, filesystem paths are confined to the expected roots, and JSON serialization rejects non-finite numbers.
