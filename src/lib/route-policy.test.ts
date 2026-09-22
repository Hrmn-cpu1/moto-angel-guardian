import test from "node:test";
import assert from "node:assert/strict";
import { corpoDaRota, permiteFallbackParaCarro, perfilDoModo } from "./route-policy.ts";

test("rota pede perfil de duas rodas com trânsito e unidades métricas", () => {
  const body = corpoDaRota(
    { lat: -23.55, lng: -46.63 },
    { address: "Avenida Paulista, São Paulo" },
    "TWO_WHEELER",
  );
  assert.equal(body.travelMode, "TWO_WHEELER");
  assert.equal(body.routingPreference, "TRAFFIC_AWARE");
  assert.equal(body.units, "METRIC");
});

test("fallback de carro só cobre recusa específica do perfil de moto", () => {
  assert.equal(permiteFallbackParaCarro(400, "TWO_WHEELER is not supported"), true);
  assert.equal(permiteFallbackParaCarro(404, "NO ROUTE for travel mode"), true);
  assert.equal(permiteFallbackParaCarro(403, "PERMISSION_DENIED"), false);
  assert.equal(permiteFallbackParaCarro(429, "OVER_QUERY_LIMIT"), false);
  assert.equal(permiteFallbackParaCarro(500, "server unavailable"), false);
});

test("perfil informa honestamente o motor que respondeu", () => {
  assert.equal(perfilDoModo("TWO_WHEELER"), "moto");
  assert.equal(perfilDoModo("DRIVE"), "carro_fallback");
});
