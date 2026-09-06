export type Mode = "aircraft" | "listen" | "satellite" | "sensors";
export type ListenBand = "airband" | "weather";
export type Aircraft = {
  hex: string;
  flight: string;
  lat: number | null;
  lon: number | null;
  alt: number | string | null;
  alt_geom?: number | null;
  speed: number | null;
  ias?: number | null;
  tas?: number | null;
  mach?: number | null;
  track: number | null;
  track_rate?: number | null;
  mag_heading?: number | null;
  true_heading?: number | null;
  baro_rate?: number | null;
  geom_rate?: number | null;
  squawk?: string | null;
  emergency?: string | null;
  category?: string | null;
  nav_qnh?: number | null;
  nav_altitude?: number | null;
  nav_heading?: number | null;
  nav_modes?: string[];
  registration?: string | null;
  aircraft_type?: string | null;
  description?: string | null;
  operator?: string | null;
  source?: string | null;
  messages?: number | null;
  seen?: number | null;
  seen_pos?: number | null;
  distance: number | null;
  bearing: number | null;
  rssi?: number;
};
export type Airport = {
  country_iso_name: string;
  country_name: string;
  iata_code: string;
  icao_code: string;
  municipality: string;
  name: string;
  elevation: number | null;
  latitude: number | null;
  longitude: number | null;
};
export type AircraftPhoto = { src: string; link: string; photographer: string };
export type AircraftDetails = {
  hex: string;
  callsign: string;
  aircraft: {
    type: string;
    icao_type: string;
    manufacturer: string;
    mode_s: string;
    registration: string;
    registered_owner_country_iso_name: string;
    registered_owner_country_name: string;
    registered_owner_operator_flag_code: string;
    registered_owner: string;
    photo: string | null;
  } | null;
  route: {
    callsign: string;
    callsign_icao: string;
    callsign_iata: string;
    airline: {
      name: string;
      icao: string;
      iata: string;
      country: string;
      country_iso: string;
      callsign: string;
    } | null;
    origin: Airport | null;
    destination: Airport | null;
  } | null;
  photo: AircraftPhoto | null;
};
export type Position = [
  number,
  string,
  string,
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
];
export type Settings = {
  name: string;
  latitude: number | null;
  longitude: number | null;
  alert_nm: number;
};
export type Reading = Record<string, string | number | boolean>;
export type Sensor = { id: string; model: string; last: number; data: Reading };
export type Snapshot = {
  now: number;
  local: boolean;
  can_control: boolean;
  username: string;
  source_age: number | null;
  settings: Settings;
  receiver: {
    mode: Mode;
    since: number;
    until: number | null;
    switching: boolean;
    error: string | null;
    options: { frequency?: number; rate?: string; band?: ListenBand };
    audio_ready: boolean;
  };
  aircraft: Aircraft[];
  stats: {
    aircraft_24h: number;
    first_record: number | null;
    farthest_nm: number | null;
    farthest_detail: { flight: string; t: number } | null;
  };
  alerts: { t: number; hex: string; flight: string; distance: number; alt: number | null }[];
  sensors: Sensor[];
  captures: {
    id: string;
    started: number;
    ended: number | null;
    status: string;
    frequency: number;
    images: { url: string; name: string }[];
  }[];
  orbital: {
    passes: {
      rise: number;
      peak: number;
      set: number;
      elevation: number;
      azimuth: number;
      name: string;
    }[];
    message: string;
    epoch?: number;
  };
  events: { t: number; text: string }[];
  tools: Record<string, boolean>;
};
export const modeNames: Record<Mode, string> = {
  aircraft: "Aircraft",
  listen: "Radio audio",
  satellite: "Satellite capture",
  sensors: "Wireless sensors",
};
export const number = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: digits });
export const clock = (t: number) =>
  new Date(t * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export async function post<T = unknown>(path: string, data: unknown) {
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}
