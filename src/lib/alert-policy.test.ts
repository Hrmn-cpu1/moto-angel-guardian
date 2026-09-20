import test from "node:test";
import assert from "node:assert/strict";
import { consolidarAlertas } from "./alert-policy.ts";

const now = Date.parse("2026-09-20T12:00:00Z");
const alerta = (id: string, created_at: string, lat = -23.55) => ({
  id,
  type: "acidente",
  title: "Acidente na via",
  lat,
  lng: -46.63,
  created_at,
  distance_km: 0.2,
});

test("alerta vencido ou com coordenada impossível não chega ao cockpit", () => {
  const validos = consolidarAlertas(
    [
      alerta("novo", "2026-09-20T11:30:00Z"),
      alerta("velho", "2026-09-20T08:00:00Z"),
      { ...alerta("zero", "2026-09-20T11:30:00Z"), lat: 0, lng: 0 },
    ],
    now,
  );
  assert.deepEqual(
    validos.map((a) => a.id),
    ["novo"],
  );
  assert.equal(validos[0]?.source, "comunidade");
});

test("relatos iguais muito próximos viram um aviso; locais diferentes continuam separados", () => {
  const validos = consolidarAlertas(
    [
      alerta("mais-novo", "2026-09-20T11:50:00Z"),
      alerta("duplicado", "2026-09-20T11:45:00Z", -23.5503),
      alerta("outro-local", "2026-09-20T11:40:00Z", -23.56),
    ],
    now,
  );
  assert.deepEqual(
    validos.map((a) => a.id),
    ["mais-novo", "outro-local"],
  );
});

test("SOS ativo mantém origem própria e não é deduplicado pelo título", () => {
  const rows = [
    { ...alerta("s1", "2026-09-20T11:50:00Z"), type: "sos", title: "SOS ativo" },
    { ...alerta("s2", "2026-09-20T11:49:00Z"), type: "sos", title: "SOS ativo" },
  ];
  const validos = consolidarAlertas(rows, now);
  assert.equal(validos.length, 2);
  assert.ok(validos.every((a) => a.source === "sos_moto_anjo"));
});
