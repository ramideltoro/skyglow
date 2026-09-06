import assert from "node:assert/strict";
import test from "node:test";
import { aerolopaSeatMapUrl } from "./aircraft-links.ts";

test("builds direct AeroLOPA links from airline codes", () => {
  assert.equal(
    aerolopaSeatMapUrl({ iata: "AA", icao: "AAL" }, "AAL1159"),
    "https://www.aerolopa.com/aa",
  );
  assert.equal(
    aerolopaSeatMapUrl({ iata: "DL", icao: "DAL" }, "DAL123"),
    "https://www.aerolopa.com/dl",
  );
});

test("maps regional American Eagle callsigns to American seat maps", () => {
  assert.equal(
    aerolopaSeatMapUrl({ iata: "", icao: "ENY" }, "ENY3427"),
    "https://www.aerolopa.com/aa",
  );
});

test("omits the shortcut when no verified direct airline page is known", () => {
  assert.equal(aerolopaSeatMapUrl({ iata: "ZZ", icao: "ZZZ" }, "ZZZ123"), null);
});
