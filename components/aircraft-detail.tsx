"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  Gauge,
  MapPin,
  Navigation,
  Plane,
  Radio,
  Route,
  ShieldCheck,
} from "lucide-react";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { aeroGrade, routeDistance } from "@/lib/aero-grade";
import { aerolopaSeatMapUrl } from "@/lib/aircraft-links";
import { Aircraft, AircraftDetails, AircraftPhoto, Airport, number } from "@/lib/skyglow";

const categoryNames: Record<string, string> = {
  A1: "Light aircraft",
  A2: "Small aircraft",
  A3: "Large aircraft",
  A4: "High-vortex aircraft",
  A5: "Heavy aircraft",
  A6: "High-performance aircraft",
  A7: "Rotorcraft",
  B1: "Glider",
  B2: "Lighter-than-air",
  B3: "Parachutist",
  B4: "Ultralight",
  B6: "Uncrewed aircraft",
  B7: "Space vehicle",
  C1: "Emergency vehicle",
  C2: "Service vehicle",
};

const sourceNames: Record<string, string> = {
  adsb_icao: "ADS-B",
  adsb_icao_nt: "ADS-B",
  adsr_icao: "ADS-R",
  tisb_icao: "TIS-B",
  mlat: "Multilateration",
  mode_s: "Mode S",
  mode_ac: "Mode A/C",
};

function heading(value: number | null | undefined) {
  if (value == null) return "—";
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return `${Math.round(value)}° ${points[Math.round(value / 45) % 8]}`;
}

function altitude(value: number | string | null | undefined) {
  if (value === "ground") return "Ground";
  return typeof value === "number" ? `${number(value)} ft` : "—";
}

function vertical(value: number | null | undefined) {
  if (value == null) return "—";
  if (Math.abs(value) < 100) return "Level";
  return `${value > 0 ? "+" : ""}${number(value)} ft/min`;
}

function phase(aircraft: Aircraft) {
  if (aircraft.alt === "ground") return "On ground";
  const rate = aircraft.baro_rate ?? aircraft.geom_rate;
  if (rate != null && rate > 300) return "Climbing";
  if (rate != null && rate < -300) return "Descending";
  return "Level flight";
}

function emergencyLabel(aircraft: Aircraft) {
  if (aircraft.squawk === "7500") return "Unlawful interference · 7500";
  if (aircraft.squawk === "7600") return "Radio failure · 7600";
  if (aircraft.squawk === "7700") return "General emergency · 7700";
  if (aircraft.emergency && aircraft.emergency !== "none")
    return aircraft.emergency.replaceAll("_", " ");
  return null;
}

function airportCode(airport: Airport | null) {
  return airport?.iata_code || airport?.icao_code || "—";
}

function airportMap(airport: Airport) {
  if (airport.latitude == null || airport.longitude == null) return undefined;
  const label = airport.name || airportCode(airport);
  return `https://maps.apple.com/?ll=${airport.latitude},${airport.longitude}&q=${encodeURIComponent(label)}`;
}

function AirportCard({ label, airport }: { label: string; airport: Airport | null }) {
  const map = airport && airportMap(airport);
  const content = (
    <>
      <small>{label}</small>
      <strong>{airportCode(airport)}</strong>
      <span>{airport?.municipality || "Route unavailable"}</span>
      {airport?.name && <em>{airport.name}</em>}
    </>
  );
  return map ? (
    <a className="airport-card" href={map} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    <div className="airport-card">{content}</div>
  );
}

function LiveStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flight-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="aircraft-data-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function photoCredit(photo: AircraftPhoto) {
  const credit = photo.photographer
    ? `Photo by ${photo.photographer}`
    : photo.source || "Aircraft photo";
  return [credit, photo.license].filter(Boolean).join(" · ");
}

type Resource = {
  label: string;
  detail: string;
  href: string;
  icon: typeof Plane;
};

export default function AircraftDetail({ aircraft }: { aircraft: Aircraft }) {
  const [details, setDetails] = useState<AircraftDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [failedPhotos, setFailedPhotos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setDetails(null);
    setFailedPhotos({});
    const params = new URLSearchParams({ hex: aircraft.hex, callsign: aircraft.flight });
    fetch(`/api/aircraft-details?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Aircraft lookup unavailable");
        return (await response.json()) as AircraftDetails;
      })
      .then(setDetails)
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setDetails(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [aircraft.hex, aircraft.flight]);

  const identity = details?.aircraft;
  const route = details?.route;
  const registration = identity?.registration || aircraft.registration || "";
  const typeCode = identity?.icao_type || aircraft.aircraft_type || "";
  const typeName = [identity?.manufacturer, identity?.type].filter(Boolean).join(" ");
  const displayType = typeName || aircraft.description || aircraft.aircraft_type || "Aircraft";
  const operator = route?.airline?.name || aircraft.operator || identity?.registered_owner || "";
  const verticalRate = aircraft.baro_rate ?? aircraft.geom_rate;
  const alert = emergencyLabel(aircraft);
  const photos = (details?.photos?.length ? details.photos : details?.photo ? [details.photo] : [])
    .filter((item) => !failedPhotos[item.src])
    .slice(0, 6);
  const photo = photos[0];
  const additionalPhotos = photos.slice(1);
  const grade = aeroGrade(aircraft);
  const routeMileage = routeDistance(route?.origin ?? null, route?.destination ?? null);

  const resources = useMemo(() => {
    const result: Resource[] = [];
    const callsign = aircraft.flight.trim();
    const hex = aircraft.hex.replace("~", "").toUpperCase();
    const seatMapUrl = aerolopaSeatMapUrl(route?.airline, callsign);
    if (callsign)
      result.push({
        label: "Live flight & history",
        detail: callsign,
        href: `https://www.flightaware.com/live/flight/${encodeURIComponent(callsign)}`,
        icon: Route,
      });
    result.push({
      label: "Track on ADS-B Exchange",
      detail: `ICAO ${hex}`,
      href: `https://globe.adsbexchange.com/?icao=${encodeURIComponent(hex.toLowerCase())}`,
      icon: Navigation,
    });
    if (seatMapUrl)
      result.push({
        label: "View airline seat maps",
        detail: `${operator || route?.airline?.name || "Airline"} on AeroLOPA`,
        href: seatMapUrl,
        icon: Plane,
      });
    if (typeCode)
      result.push({
        label: "Aircraft documentation",
        detail: `${typeCode} type guide`,
        href: `https://skybrary.aero/aircraft/${encodeURIComponent(typeCode.toLowerCase())}`,
        icon: Gauge,
      });
    result.push({
      label: "Fleet history & photos",
      detail: registration || `ICAO ${hex}`,
      href: `https://www.planespotters.net/hex/${encodeURIComponent(hex)}`,
      icon: Plane,
    });
    if (/^N[0-9A-Z]+$/i.test(registration))
      result.push({
        label: "FAA registration",
        detail: registration.toUpperCase(),
        href: `https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=${encodeURIComponent(registration.slice(1))}`,
        icon: ShieldCheck,
      });
    result.push({
      label: "Official safety records",
      detail: registration ? `Search NTSB for ${registration}` : "NTSB investigation database",
      href: "https://carol.ntsb.gov/",
      icon: CircleAlert,
    });
    return result;
  }, [aircraft.flight, aircraft.hex, displayType, operator, registration, route, typeCode]);

  return (
    <>
      <div className="aircraft-title-row">
        <span className="aircraft-title-icon">
          <Plane />
        </span>
        <div>
          <SheetTitle tabIndex={-1} autoFocus>
            {aircraft.flight || registration || aircraft.hex.toUpperCase()}
          </SheetTitle>
          <SheetDescription>
            {[operator, displayType, registration].filter(Boolean).join(" · ") ||
              `Aircraft broadcast · ${aircraft.hex.toUpperCase()}`}
          </SheetDescription>
        </div>
      </div>

      {alert && (
        <div className="aircraft-emergency" role="alert">
          <CircleAlert />
          <div>
            <strong>Special transponder status</strong>
            <span>{alert}</span>
          </div>
        </div>
      )}

      <div className="aircraft-hero">
        {photo ? (
          <a href={photo.link} target="_blank" rel="noreferrer" className="aircraft-photo-link">
            <img
              src={photo.src}
              alt={`${registration || aircraft.flight || "Detected aircraft"}${displayType ? `, ${displayType}` : ""}`}
              onError={() => setFailedPhotos((current) => ({ ...current, [photo.src]: true }))}
              referrerPolicy="no-referrer"
            />
            <span>
              {photoCredit(photo)}
              <ArrowUpRight />
            </span>
          </a>
        ) : (
          <div className="aircraft-photo-placeholder">
            <Plane />
            <span>{loading ? "Finding an aircraft photo…" : "No verified photo available"}</span>
          </div>
        )}
        {additionalPhotos.length > 0 && (
          <div className="aircraft-gallery-block">
            <div className="aircraft-gallery-heading">
              <strong>More photos</strong>
              <span>
                {additionalPhotos.length} additional{" "}
                {additionalPhotos.length === 1 ? "view" : "views"}
              </span>
            </div>
            <div className="aircraft-photo-gallery" aria-label="Additional aircraft photos">
              {additionalPhotos.map((item, index) => (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="aircraft-gallery-photo"
                  key={item.src}
                  aria-label={`Open aircraft photo ${index + 2} of ${photos.length} on ${item.source || "its source"}`}
                >
                  <img
                    src={item.src}
                    alt={`${registration || aircraft.flight || "Detected aircraft"}, view ${index + 2} of ${photos.length}`}
                    loading="lazy"
                    decoding="async"
                    onError={() => setFailedPhotos((current) => ({ ...current, [item.src]: true }))}
                    referrerPolicy="no-referrer"
                  />
                  <span>
                    {photoCredit(item)}
                    <ArrowUpRight />
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="flight-badges">
          <span>{phase(aircraft)}</span>
          {aircraft.category && (
            <span>{categoryNames[aircraft.category] || aircraft.category}</span>
          )}
          {(aircraft.source || aircraft.rssi != null) && (
            <span>
              <Radio /> {sourceNames[aircraft.source || ""] || aircraft.source || "Receiver"}
            </span>
          )}
        </div>
      </div>

      <section className="aircraft-section aerograde-section">
        <div className="aircraft-section-title">
          <Gauge />
          <div>
            <h3>AeroGrade</h3>
            <p>Live aircraft profile confidence</p>
          </div>
        </div>
        <div className="aerograde-overview">
          <div
            className="aerograde-gauge"
            role="meter"
            aria-label={`AeroGrade ${grade.score} out of 100, ${grade.label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={grade.score}
          >
            <svg viewBox="0 0 180 104" aria-hidden="true">
              <path className="aerograde-gauge-track" d="M 18 91 A 72 72 0 0 1 162 91" />
              <path
                className="aerograde-gauge-value"
                d="M 18 91 A 72 72 0 0 1 162 91"
                pathLength="100"
                style={{ strokeDasharray: `${grade.score} 100` }}
              />
            </svg>
            <span>
              <strong>{grade.score}</strong>
              <small>/ 100</small>
            </span>
          </div>
          <div className="aerograde-summary">
            <strong>{grade.letter}</strong>
            <div>
              <span>{grade.label}</span>
              <small>Based on the signal and fields received now</small>
            </div>
          </div>
        </div>
        <div className="aerograde-factors">
          {grade.factors.map((factor) => (
            <div className="aerograde-factor" key={factor.label}>
              <div>
                <strong>{factor.label}</strong>
                <span>
                  {factor.score}/{factor.maximum}
                </span>
              </div>
              <span className="aerograde-factor-track" aria-hidden="true">
                <span style={{ width: `${(factor.score / factor.maximum) * 100}%` }} />
              </span>
              <small>{factor.detail}</small>
            </div>
          ))}
        </div>
        <div className="aerograde-context">
          <div>
            <span>Published route</span>
            <strong>
              {routeMileage ? `${number(routeMileage.nauticalMiles)} nm` : "Unavailable"}
            </strong>
            <small>
              {routeMileage ? `${number(routeMileage.miles)} statute miles` : "Needs two airports"}
            </small>
          </div>
          <div>
            <span>Receiver messages</span>
            <strong>{aircraft.messages == null ? "Unavailable" : number(aircraft.messages)}</strong>
            <small>Current decoder session</small>
          </div>
          <div>
            <span>Safety records</span>
            <strong>Official search</strong>
            <small>NTSB link below</small>
          </div>
          <div>
            <span>Airframe mileage</span>
            <strong>Not published</strong>
            <small>Maintenance records required</small>
          </div>
        </div>
        <p className="aerograde-note">
          AeroGrade rates how complete and reliable this live profile appears. It is not an
          airworthiness, maintenance, age, or safety rating.
        </p>
      </section>

      {(route?.origin || route?.destination) && (
        <section className="aircraft-section route-section">
          <div className="aircraft-section-title">
            <Route />
            <div>
              <h3>Today’s route</h3>
              <p>
                {route.airline?.name || "Published flight route"}
                {route.callsign_iata ? ` · ${route.callsign_iata}` : ""}
              </p>
            </div>
          </div>
          <div className="route-line">
            <AirportCard label="From" airport={route.origin} />
            <span className="route-arrow">
              <span />
              <ArrowRight />
            </span>
            <AirportCard label="To" airport={route.destination} />
          </div>
        </section>
      )}

      <section className="aircraft-section">
        <div className="aircraft-section-title">
          <Gauge />
          <div>
            <h3>Live flight data</h3>
            <p>Received directly by your antenna</p>
          </div>
        </div>
        <div className="flight-stat-grid">
          <LiveStat
            label="Altitude"
            value={altitude(aircraft.alt)}
            detail={
              aircraft.alt_geom != null ? `${number(aircraft.alt_geom)} ft geometric` : undefined
            }
          />
          <LiveStat
            label="Ground speed"
            value={aircraft.speed == null ? "—" : `${number(aircraft.speed)} kt`}
            detail={aircraft.speed == null ? undefined : `${number(aircraft.speed * 1.15078)} mph`}
          />
          <LiveStat
            label="Heading"
            value={heading(aircraft.track)}
            detail={
              aircraft.track_rate != null
                ? `${number(aircraft.track_rate, 1)}°/sec turn`
                : undefined
            }
          />
          <LiveStat
            label="Vertical speed"
            value={vertical(verticalRate)}
            detail={phase(aircraft)}
          />
          <LiveStat
            label="From receiver"
            value={aircraft.distance == null ? "—" : `${number(aircraft.distance, 1)} nm`}
            detail={aircraft.bearing == null ? undefined : `${heading(aircraft.bearing)} bearing`}
          />
          <LiveStat
            label="Signal"
            value={aircraft.rssi == null ? "—" : `${number(aircraft.rssi, 1)} dBFS`}
            detail={
              aircraft.seen == null ? undefined : `updated ${number(aircraft.seen, 1)} sec ago`
            }
          />
        </div>
        {aircraft.lat != null && aircraft.lon != null && (
          <a
            className="position-link"
            href={`https://maps.apple.com/?ll=${aircraft.lat},${aircraft.lon}&q=${encodeURIComponent(aircraft.flight || registration || aircraft.hex)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin />
            {aircraft.lat.toFixed(4)}, {aircraft.lon.toFixed(4)}
            <span>Open in Maps</span>
            <ArrowUpRight />
          </a>
        )}
      </section>

      <section className="aircraft-section">
        <div className="aircraft-section-title">
          <Plane />
          <div>
            <h3>Aircraft identity</h3>
            <p>{loading ? "Looking up registry and operator data…" : "Registry and fleet data"}</p>
          </div>
        </div>
        <dl className="aircraft-data-list">
          <DataRow label="Registration" value={registration} />
          <DataRow label="Aircraft" value={displayType} />
          <DataRow label="ICAO type" value={typeCode} />
          <DataRow label="Operator / airline" value={operator} />
          <DataRow
            label="Registered owner"
            value={identity?.registered_owner !== operator ? identity?.registered_owner : undefined}
          />
          <DataRow label="Registered country" value={identity?.registered_owner_country_name} />
          <DataRow label="Flight callsign" value={aircraft.flight} />
          <DataRow label="ICAO address" value={aircraft.hex.toUpperCase()} />
        </dl>
      </section>

      <details className="aircraft-section technical-details">
        <summary>
          <span>
            <Radio />
            <strong>Transponder & navigation</strong>
          </span>
          <small>Technical broadcast fields</small>
        </summary>
        <dl className="aircraft-data-list">
          <DataRow label="Squawk" value={aircraft.squawk} />
          <DataRow label="Emergency status" value={aircraft.emergency} />
          <DataRow
            label="Selected altitude"
            value={aircraft.nav_altitude != null ? `${number(aircraft.nav_altitude)} ft` : null}
          />
          <DataRow
            label="Selected heading"
            value={aircraft.nav_heading != null ? heading(aircraft.nav_heading) : null}
          />
          <DataRow label="Autopilot modes" value={aircraft.nav_modes?.join(" · ")} />
          <DataRow
            label="Altimeter setting"
            value={aircraft.nav_qnh != null ? `${number(aircraft.nav_qnh, 1)} hPa` : null}
          />
          <DataRow
            label="Indicated airspeed"
            value={aircraft.ias != null ? `${number(aircraft.ias)} kt` : null}
          />
          <DataRow
            label="True airspeed"
            value={aircraft.tas != null ? `${number(aircraft.tas)} kt` : null}
          />
          <DataRow label="Mach" value={aircraft.mach != null ? number(aircraft.mach, 3) : null} />
          <DataRow
            label="Magnetic heading"
            value={aircraft.mag_heading != null ? heading(aircraft.mag_heading) : null}
          />
          <DataRow
            label="True heading"
            value={aircraft.true_heading != null ? heading(aircraft.true_heading) : null}
          />
          <DataRow label="Message count" value={aircraft.messages} />
          <DataRow
            label="Position age"
            value={aircraft.seen_pos != null ? `${number(aircraft.seen_pos, 1)} sec` : null}
          />
          <DataRow
            label="Data source"
            value={sourceNames[aircraft.source || ""] || aircraft.source}
          />
        </dl>
      </details>

      <section className="aircraft-section">
        <div className="aircraft-section-title">
          <ShieldCheck />
          <div>
            <h3>Research this aircraft</h3>
            <p>Cabin, documentation, registry, tracking, and safety sources</p>
          </div>
        </div>
        <div className="aircraft-resource-grid">
          {resources.map(({ label, detail, href, icon: Icon }) => (
            <a href={href} target="_blank" rel="noreferrer" key={label}>
              <Icon />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              <ArrowUpRight />
            </a>
          ))}
        </div>
        <p className="aircraft-source-note">
          Aircraft identity and route details come from ADSBDB. Photos come from PlaneSpotters.net
          and Wikimedia Commons when available. Seat layouts vary by airline and individual
          aircraft; verify the registration before choosing a seat. Safety links open official
          records and do not imply a safety rating.
        </p>
      </section>
    </>
  );
}
