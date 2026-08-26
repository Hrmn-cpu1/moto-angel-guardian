import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodificarPolyline,
  fimDosPassos,
  manobraNormalizada,
  mapearRotaDaResposta,
  segundosDaDuracao,
  statusDeFalhaHttp,
  viagemPodeFicarPronta,
} from "./rota.ts";
import { setaDaManobra } from "./navigation-cue.ts";

/* Amostra REAL da Routes API (São Paulo, Sé -> Av. Nove de Julho), obtida pelo
 * gateway com HTTP 200 durante a investigação do P0 "rota não aparece". */
const POLYLINE_REAL = "jwvnCrds{GIL_@rAr@^aC~J?`@xAZgAzCu@fBYXgAz@o@`@e@Hg@B_@EUK{AiAMG";

test("decodifica a polilinha do Google em coordenadas plausíveis", () => {
  const pontos = decodificarPolyline(POLYLINE_REAL);
  assert.ok(pontos.length > 5);
  assert.ok(Math.abs(pontos[0]!.lat + 23.55) < 0.1, "latitude perto de São Paulo");
  assert.ok(Math.abs(pontos[0]!.lng + 46.63) < 0.1, "longitude perto de São Paulo");
});

test("polilinha vazia ou ausente nunca quebra", () => {
  assert.deepEqual(decodificarPolyline(""), []);
  assert.deepEqual(decodificarPolyline(null), []);
  assert.deepEqual(decodificarPolyline(undefined), []);
});

test("duração ISO da Routes API vira segundos", () => {
  assert.equal(segundosDaDuracao("464s"), 464);
  assert.equal(segundosDaDuracao(120), 120);
  assert.equal(segundosDaDuracao("abc"), 0);
  assert.equal(segundosDaDuracao(undefined), 0);
});

test("manobra da Routes API continua legível pela seta do cockpit", () => {
  assert.equal(manobraNormalizada("TURN_LEFT"), "turn-left");
  assert.equal(setaDaManobra(manobraNormalizada("TURN_LEFT")), "esquerda");
  assert.equal(setaDaManobra(manobraNormalizada("TURN_SLIGHT_RIGHT")), "direita");
  assert.equal(setaDaManobra(manobraNormalizada("UTURN_LEFT")), "retorno");
  assert.equal(setaDaManobra(manobraNormalizada("ROUNDABOUT_RIGHT")), "rotatoria");
  assert.equal(manobraNormalizada(""), null);
});

test("mapeia a resposta da Routes API para a rota do app", () => {
  const rota = mapearRotaDaResposta({
    routes: [
      {
        distanceMeters: 3453,
        duration: "464s",
        polyline: { encodedPolyline: POLYLINE_REAL },
        legs: [
          {
            steps: [
              {
                distanceMeters: 55,
                endLocation: { latLng: { latitude: -23.55, longitude: -46.63 } },
                navigationInstruction: {
                  maneuver: "TURN_LEFT",
                  instructions: "Vire à esquerda na  Praça da Sé",
                },
              },
              { distanceMeters: 33 },
            ],
          },
        ],
      },
    ],
  });
  assert.ok(rota);
  assert.equal(rota!.distanciaM, 3453);
  assert.equal(rota!.duracaoS, 464);
  assert.equal(rota!.passos.length, 2);
  assert.equal(rota!.passos[0]!.instrucao, "Vire à esquerda na Praça da Sé");
  assert.equal(rota!.passos[0]!.manobra, "turn-left");
  assert.deepEqual(rota!.passos[0]!.fim, { lat: -23.55, lng: -46.63 });
  assert.equal(rota!.passos[1]!.fim, null);
});

test("resposta sem rota utilizável devolve null — nada é inventado", () => {
  assert.equal(mapearRotaDaResposta({}), null);
  assert.equal(mapearRotaDaResposta({ routes: [] }), null);
  assert.equal(mapearRotaDaResposta({ routes: [{ distanceMeters: 100 }] }), null);
});

test("falha HTTP da Routes API vira status que o diagnóstico já entende", () => {
  assert.equal(statusDeFalhaHttp(403, "PERMISSION_DENIED"), "REQUEST_DENIED");
  assert.equal(statusDeFalhaHttp(429), "OVER_QUERY_LIMIT");
  assert.equal(statusDeFalhaHttp(400, "invalid argument"), "INVALID_REQUEST");
  assert.equal(statusDeFalhaHttp(400, "NOT_FOUND: origin"), "NOT_FOUND");
  assert.equal(statusDeFalhaHttp(500), "UNKNOWN_ERROR");
});

test("enquadramento usa apenas os fins de passo conhecidos", () => {
  const passos = [
    { distanciaM: 10, instrucao: null, manobra: null, fim: { lat: 1, lng: 2 } },
    { distanciaM: 10, instrucao: null, manobra: null, fim: null },
    { distanciaM: 10, instrucao: null, manobra: null, fim: { lat: 3, lng: 4 } },
  ];
  assert.deepEqual(fimDosPassos(passos, 2), [{ lat: 1, lng: 2 }]);
  assert.equal(fimDosPassos(passos, 0).length, 0);
});

test("com destino escolhido, viagem só está pronta se existir traçado", () => {
  assert.equal(viagemPodeFicarPronta(false, null), true);
  assert.equal(viagemPodeFicarPronta(true, null), false);
  assert.equal(
    viagemPodeFicarPronta(true, {
      distanciaM: 100,
      duracaoS: 60,
      pontos: [{ lat: 1, lng: 2 }],
      passos: [],
      destinoTexto: null,
    }),
    false,
  );
  assert.equal(
    viagemPodeFicarPronta(true, {
      distanciaM: 100,
      duracaoS: 60,
      pontos: [
        { lat: 1, lng: 2 },
        { lat: 1.1, lng: 2.1 },
      ],
      passos: [],
      destinoTexto: null,
    }),
    true,
  );
});
