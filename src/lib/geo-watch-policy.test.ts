import test from "node:test";
import assert from "node:assert/strict";
import { atrasoReinicioGps } from "./geo-watch.ts";

test("GPS usa backoff progressivo e limitado", () => {
  assert.equal(atrasoReinicioGps(0), 1_000);
  assert.equal(atrasoReinicioGps(1), 2_000);
  assert.equal(atrasoReinicioGps(4), 16_000);
  assert.equal(atrasoReinicioGps(20), 30_000);
});
