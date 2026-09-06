import assert from "node:assert/strict";
import test from "node:test";
import { aeroGrade, routeDistance } from "./aero-grade.ts";
import type { Aircraft } from "./skyglow.ts";

const baseAircraft: Aircraft = {
  hex: "a00001",
  flight: "",
  lat: null,
  lon: null,
  alt: null,
  speed: null,
  track: null,
  distance: null,
  bearing: null,
};

test("AeroGrade awards every point only to a complete, fresh profile", () => {
  const aircraft: Aircraft = {
    ...baseAircraft,
    flight: "SQWAK1",
    lat: 27.95,
    lon: -82.46,
    alt: 18_000,
    alt_geom: 18_125,
    speed: 410,
    track: 25,
    baro_rate: 640,
    squawk: "1234",
    emergency: "none",
    category: "A3",
    nav_altitude: 20_000,
    registration: "N12345",
    aircraft_type: "A320",
    operator: "Example Air",
    source: "adsb_icao",
    messages: 1_200,
    seen: 0.4,
    seen_pos: 0.8,
    rssi: -9,
  };

  const grade = aeroGrade(aircraft);
  assert.equal(grade.score, 100);
  assert.equal(grade.letter, "A+");
  assert.deepEqual(
    grade.factors.map(({ score, maximum }) => [score, maximum]),
    [
      [40, 40],
      [25, 25],
      [20, 20],
      [15, 15],
    ],
  );
});

test("AeroGrade labels sparse archived observations as limited", () => {
  const grade = aeroGrade({ ...baseAircraft, alt: 7_500, distance: 4.2 });
  assert.equal(grade.score, 5);
  assert.equal(grade.letter, "D");
  assert.equal(grade.label, "Limited profile");
});

test("route distance returns aviation and road-style units", () => {
  const distance = routeDistance(
    { latitude: 27.9755, longitude: -82.5332 },
    { latitude: 40.6413, longitude: -73.7781 },
  );
  assert.ok(distance);
  assert.ok(distance.nauticalMiles > 850 && distance.nauticalMiles < 900);
  assert.equal(Math.round(distance.miles), Math.round(distance.nauticalMiles * 1.15078));
  assert.equal(routeDistance(null, null), null);
});
