import test from "node:test";
import assert from "node:assert/strict";
import { normalizeE164, buildSosMessage, isWhatsAppConfigured } from "./sos.server.ts";

test("normalizeE164 concorda com normalizePhone do cliente", () => {
  assert.equal(normalizeE164("(11) 99999-9999"), "5511999999999");
  assert.equal(normalizeE164("5511999999999"), "5511999999999");
  assert.equal(normalizeE164(""), "");
});

test("mensagem de SOS traz nome, aviso, horário, coordenadas e link", () => {
  const msg = buildSosMessage({
    name: "Herman",
    phone: "(13) 99999-0000",
    lat: -23.9608,
    lng: -46.3339,
    when: new Date("2026-08-05T15:30:00Z"),
  });
  assert.ok(msg.includes("MOTO ANJO"), "identifica o app");
  assert.ok(msg.includes("Herman"), "traz o nome de quem acionou");
  assert.ok(msg.includes("SOS"), "deixa claro que é emergência");
  assert.ok(msg.includes("-23.9608"), "traz a latitude");
  assert.ok(msg.includes("-46.3339"), "traz a longitude");
  assert.ok(msg.includes("https://maps.google.com/?q=-23.9608,-46.3339"), "link do Maps");
  assert.ok(msg.includes("05/08/2026"), "data no fuso de São Paulo");
  assert.ok(msg.includes("12:30"), "hora convertida para America/Sao_Paulo");
});

test("mensagem não quebra quando o perfil não tem telefone", () => {
  const msg = buildSosMessage({
    name: "Motociclista",
    phone: "",
    lat: -23.5,
    lng: -46.6,
    when: new Date("2026-08-05T12:00:00Z"),
  });
  assert.ok(msg.includes("não informado"));
});

test("isWhatsAppConfigured exige ativação e template além das credenciais", () => {
  const keys = [
    "SOS_DELIVERY_ENABLED",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_SOS_TEMPLATE_NAME",
    "WHATSAPP_SOS_TEMPLATE_LANGUAGE",
    "WHATSAPP_GRAPH_VERSION",
  ];
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    keys.forEach((k) => delete process.env[k]);
    process.env.WHATSAPP_ACCESS_TOKEN = "fixture";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    assert.equal(isWhatsAppConfigured(), false);
    process.env.SOS_DELIVERY_ENABLED = "true";
    process.env.WHATSAPP_SOS_TEMPLATE_NAME = "sos_test";
    process.env.WHATSAPP_SOS_TEMPLATE_LANGUAGE = "pt_BR";
    process.env.WHATSAPP_GRAPH_VERSION = "v23.0";
    assert.equal(isWhatsAppConfigured(), true);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
