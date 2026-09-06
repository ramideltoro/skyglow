const aerolopaAirlines: Record<string, string> = {
  AA: "aa",
  AAL: "aa",
  ENY: "aa",
  JIA: "aa",
  PDT: "aa",
  DL: "dl",
  DAL: "dl",
  UA: "ua",
  UAL: "ua",
  B6: "b6",
  JBU: "b6",
  WN: "wn",
  SWA: "wn",
  AS: "as",
  ASA: "as",
  HA: "ha",
  HAL: "ha",
  NK: "nk",
  NKS: "nk",
  F9: "f9",
  FFT: "f9",
  G4: "g4",
  AAY: "g4",
  AC: "ac",
  ACA: "ac",
  BA: "ba",
  BAW: "ba",
  AF: "af",
  AFR: "af",
  LH: "lh",
  DLH: "lh",
  EK: "ek",
  UAE: "ek",
  TK: "tk",
  THY: "tk",
};

export function aerolopaSeatMapUrl(
  airline: { iata?: string; icao?: string } | null | undefined,
  callsign: string,
) {
  const identifiers = [airline?.iata, airline?.icao, callsign.slice(0, 3)];
  for (const identifier of identifiers) {
    const slug = aerolopaAirlines[identifier?.trim().toUpperCase() || ""];
    if (slug) return `https://www.aerolopa.com/${slug}`;
  }
  return null;
}
