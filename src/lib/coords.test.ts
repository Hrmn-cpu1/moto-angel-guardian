import test from "node:test";
import assert from "node:assert/strict";
import { isValidCoordinate, isAccurateEnoughForEmergency, googleMapsUrl } from "./coords.ts";

test("aceita coordenadas reais do Brasil", () => {
  assert.ok(isValidCoordinate(-23.9608, -46.3339)); // Santos
  assert.ok(isValidCoordinate(-23.55052, -46.633308)); // São Paulo
});

test("rejeita fora de faixa, NaN e não-números", () => {
  assert.equal(isValidCoordinate(91, 0), false);
  assert.equal(isValidCoordinate(-91, 0), false);
  assert.equal(isValidCoordinate(0, 181), false);
  assert.equal(isValidCoordinate(NaN, -46), false);
  assert.equal(isValidCoordinate(Infinity, -46), false);
  assert.equal(isValidCoordinate("-23.5", -46), false);
  assert.equal(isValidCoordinate(undefined, undefined), false);
});

test("rejeita Null Island (0,0) — GPS quebrado devolvendo zero", () => {
  assert.equal(isValidCoordinate(0, 0), false);
});

test("precisão: recusa fix grosseiro demais para emergência", () => {
  assert.ok(isAccurateEnoughForEmergency(15));
  assert.ok(isAccurateEnoughForEmergency(1999));
  assert.equal(isAccurateEnoughForEmergency(5000), false);
  assert.ok(isAccurateEnoughForEmergency(null), "sem dado de precisão, não bloqueia");
});

test("googleMapsUrl aponta para o par correto", () => {
  assert.equal(
    googleMapsUrl({ lat: -23.9608, lng: -46.3339 }),
    "https://maps.google.com/?q=-23.9608,-46.3339",
  );
});
