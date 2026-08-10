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

test("isWhatsAppConfigured só é verdadeiro com as DUAS credenciais", () => {
  const t = process.env.WHATSAPP_ACCESS_TOKEN;
  const i = process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  assert.equal(isWhatsAppConfigured(), false);
  process.env.WHATSAPP_ACCESS_TOKEN = "x";
  assert.equal(isWhatsAppConfigured(), false, "token sozinho não basta");
  process.env.WHATSAPP_PHONE_NUMBER_ID = "y";
  assert.equal(isWhatsAppConfigured(), true);
  if (t) process.env.WHATSAPP_ACCESS_TOKEN = t; else delete process.env.WHATSAPP_ACCESS_TOKEN;
  if (i) process.env.WHATSAPP_PHONE_NUMBER_ID = i; else delete process.env.WHATSAPP_PHONE_NUMBER_ID;
});
