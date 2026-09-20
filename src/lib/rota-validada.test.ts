import { test } from "node:test";
import assert from "node:assert/strict";
import { mapearRotaValidada } from "./rota-validada.ts";

const POLYLINE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
const resposta = (encodedPolyline: string) => ({
  routes: [
    {
      distanceMeters: 4200,
      duration: "300s",
      polyline: { encodedPolyline },
      legs: [
        {
          steps: [
            {
              distanceMeters: 100,
              endLocation: { latLng: { latitude: 38.5, longitude: -120.2 } },
            },
          ],
        },
      ],
    },
  ],
});

test("aceita resposta íntegra da API sem alterar o traçado", () => {
  const rota = mapearRotaValidada(resposta(POLYLINE), "Destino");
  assert.ok(rota);
  assert.equal(rota!.pontos.length, 3);
  assert.equal(rota!.destinoTexto, "Destino");
});

test("rejeita polilinha truncada em vez de desenhar trajeto parcial", () => {
  assert.equal(mapearRotaValidada(resposta(POLYLINE.slice(0, -1))), null);
  assert.equal(mapearRotaValidada(resposta("_p~iF~ps|U_ulLnnqC_mqNvxq")), null);
});

test("rejeita caracteres inválidos da polilinha", () => {
  assert.equal(mapearRotaValidada(resposta(`${POLYLINE}!`)), null);
});

test("rejeita etapas com coordenadas fora dos limites", () => {
  const invalid = resposta(POLYLINE);
  invalid.routes[0]!.legs[0]!.steps[0]!.endLocation.latLng.latitude = 100;
  assert.equal(mapearRotaValidada(invalid), null);
});

test("rejeita distância negativa sem inventar rota", () => {
  const invalid = resposta(POLYLINE);
  invalid.routes[0]!.distanceMeters = -1;
  assert.equal(mapearRotaValidada(invalid), null);
});
