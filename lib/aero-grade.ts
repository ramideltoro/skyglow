import type { Aircraft } from "@/lib/skyglow";

export type AeroGradeFactor = {
  label: string;
  score: number;
  maximum: number;
  detail: string;
};

export type AeroGrade = {
  score: number;
  letter: string;
  label: string;
  factors: AeroGradeFactor[];
};

const available = (value: unknown) => value !== null && value !== undefined && value !== "";

function telemetryFactor(aircraft: Aircraft): AeroGradeFactor {
  const position = available(aircraft.lat) && available(aircraft.lon);
  const verticalRate = available(aircraft.baro_rate) || available(aircraft.geom_rate);
  const navigation =
    available(aircraft.nav_altitude) ||
    available(aircraft.nav_heading) ||
    Boolean(aircraft.nav_modes?.length);
  const secondaryFlightData =
    available(aircraft.alt_geom) ||
    available(aircraft.ias) ||
    available(aircraft.tas) ||
    available(aircraft.mach) ||
    available(aircraft.mag_heading) ||
    available(aircraft.true_heading);
  const primaryFields = [
    position,
    available(aircraft.alt),
    available(aircraft.speed),
    available(aircraft.track),
    verticalRate,
    available(aircraft.squawk),
  ].filter(Boolean).length;
  const score =
    (position ? 8 : 0) +
    (available(aircraft.alt) ? 5 : 0) +
    (available(aircraft.speed) ? 5 : 0) +
    (available(aircraft.track) ? 5 : 0) +
    (verticalRate ? 4 : 0) +
    (available(aircraft.squawk) ? 3 : 0) +
    (navigation ? 4 : 0) +
    (secondaryFlightData ? 6 : 0);
  return {
    label: "Telemetry",
    score,
    maximum: 40,
    detail: `${primaryFields} of 6 primary flight fields received`,
  };
}

function receptionFactor(aircraft: Aircraft): AeroGradeFactor {
  const seen = aircraft.seen;
  const messageFreshness =
    seen == null ? 0 : seen <= 1 ? 10 : seen <= 3 ? 8 : seen <= 7 ? 5 : seen <= 15 ? 2 : 0;
  const seenPosition = aircraft.seen_pos;
  const positionFreshness =
    seenPosition == null
      ? 0
      : seenPosition <= 2
        ? 5
        : seenPosition <= 5
          ? 4
          : seenPosition <= 10
            ? 2
            : seenPosition <= 15
              ? 1
              : 0;
  const rssi = aircraft.rssi;
  const signal =
    rssi == null ? 0 : rssi >= -10 ? 10 : rssi >= -20 ? 8 : rssi >= -30 ? 6 : rssi >= -40 ? 3 : 1;
  const freshness = seen == null ? "age unavailable" : `${seen.toFixed(1)} sec old`;
  const strength = rssi == null ? "signal unavailable" : `${rssi.toFixed(1)} dBFS`;
  return {
    label: "Reception",
    score: messageFreshness + positionFreshness + signal,
    maximum: 25,
    detail: `${freshness} · ${strength}`,
  };
}

function identityFactor(aircraft: Aircraft): AeroGradeFactor {
  const fields = [
    available(aircraft.flight),
    available(aircraft.registration),
    available(aircraft.aircraft_type) || available(aircraft.description),
    available(aircraft.operator),
  ];
  const count = fields.filter(Boolean).length;
  return {
    label: "Identity",
    score: count * 5,
    maximum: 20,
    detail: `${count} of 4 identity fields available`,
  };
}

function continuityFactor(aircraft: Aircraft): AeroGradeFactor {
  const source = aircraft.source || "";
  const sourceScore = source.startsWith("adsb_") ? 6 : source === "mlat" ? 4 : source ? 3 : 0;
  const messages = aircraft.messages;
  const messageScore =
    messages == null
      ? 0
      : messages >= 1000
        ? 6
        : messages >= 300
          ? 5
          : messages >= 100
            ? 4
            : messages >= 30
              ? 3
              : messages > 0
                ? 1
                : 0;
  const statusScore = available(aircraft.emergency) || available(aircraft.category) ? 3 : 0;
  const sourceLabel = source.startsWith("adsb_")
    ? "ADS-B"
    : source === "mlat"
      ? "MLAT"
      : source
        ? source.replaceAll("_", " ").toUpperCase()
        : "source unknown";
  return {
    label: "Continuity",
    score: sourceScore + messageScore + statusScore,
    maximum: 15,
    detail: `${sourceLabel} · ${messages == null ? "message count unavailable" : `${messages.toLocaleString()} messages`}`,
  };
}

export function aeroGrade(aircraft: Aircraft): AeroGrade {
  const factors = [
    telemetryFactor(aircraft),
    receptionFactor(aircraft),
    identityFactor(aircraft),
    continuityFactor(aircraft),
  ];
  const score = factors.reduce((total, factor) => total + factor.score, 0);
  if (score >= 90) return { score, letter: "A+", label: "Exceptional profile", factors };
  if (score >= 80) return { score, letter: "A", label: "Excellent profile", factors };
  if (score >= 70) return { score, letter: "B+", label: "Strong profile", factors };
  if (score >= 60) return { score, letter: "B", label: "Good profile", factors };
  if (score >= 50) return { score, letter: "C", label: "Fair profile", factors };
  return { score, letter: "D", label: "Limited profile", factors };
}

export function routeDistance(
  origin: AirportCoordinates | null,
  destination: AirportCoordinates | null,
) {
  if (
    origin?.latitude == null ||
    origin.longitude == null ||
    destination?.latitude == null ||
    destination.longitude == null
  )
    return null;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const startLatitude = radians(origin.latitude);
  const endLatitude = radians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const nauticalMiles = 3440.065 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return { nauticalMiles, miles: nauticalMiles * 1.15078 };
}

type AirportCoordinates = {
  latitude: number | null;
  longitude: number | null;
};
