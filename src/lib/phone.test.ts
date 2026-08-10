import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, waLink } from "./phone.ts";

test("normalizePhone: celular com DDD vira E.164 brasileiro", () => {
  assert.equal(normalizePhone("(11) 99999-9999"), "5511999999999");
  assert.equal(normalizePhone("11999999999"), "5511999999999");
  assert.equal(normalizePhone("13 98765-4321"), "5513987654321");
});

test("normalizePhone: fixo de 10 dígitos também recebe o 55", () => {
  assert.equal(normalizePhone("(13) 3333-4444"), "551333334444");
});

test("normalizePhone: número que já tem código de país não é duplicado", () => {
  assert.equal(normalizePhone("5511999999999"), "5511999999999");
  assert.equal(normalizePhone("+55 11 99999-9999"), "5511999999999");
});

test("normalizePhone: entradas inválidas não explodem", () => {
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone("abc"), "");
  assert.equal(normalizePhone("---"), "");
});

test("waLink: monta o wa.me com a mensagem codificada", () => {
  const link = waLink("(11) 99999-9999", "SOS 🚨 preciso de ajuda");
  assert.ok(link.startsWith("https://wa.me/5511999999999?text="));
  assert.ok(link.includes(encodeURIComponent("SOS 🚨 preciso de ajuda")));
  assert.ok(!link.includes(" "), "não pode restar espaço bruto na URL");
});
