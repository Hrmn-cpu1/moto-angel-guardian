import test from "node:test";
import assert from "node:assert/strict";
import {
  _resetarPermissao,
  assinarPermissao,
  definirLeitura,
  leituraAtual,
  ofereceConfiguracoes,
  precisaMostrarGate,
  traduzirErroDeGps,
  traduzirEstadoNativo,
  traduzirEstadoWeb,
} from "./location-permission.ts";

test("estado nativo do Android vira status do app", () => {
  assert.equal(traduzirEstadoNativo("granted"), "concedida");
  assert.equal(traduzirEstadoNativo("prompt"), "perguntar");
  assert.equal(traduzirEstadoNativo("prompt-with-rationale"), "perguntar");
  assert.equal(traduzirEstadoNativo("denied"), "negada_permanente");
  assert.equal(traduzirEstadoNativo(undefined), "desconhecido");
});

test("estado da Permissions API vira status do app", () => {
  assert.equal(traduzirEstadoWeb("granted"), "concedida");
  assert.equal(traduzirEstadoWeb("prompt"), "perguntar");
  assert.equal(traduzirEstadoWeb("denied"), "negada");
  assert.equal(traduzirEstadoWeb("qualquer-coisa"), "desconhecido");
});

test("erro do GPS separa recusa de falha temporária", () => {
  assert.equal(traduzirErroDeGps(1), "negada");
  assert.equal(traduzirErroDeGps(2), "perguntar", "posição indisponível não é recusa");
  assert.equal(traduzirErroDeGps(3), "perguntar", "timeout não é recusa");
});

test("o gate NÃO reaparece com a permissão concedida", () => {
  assert.equal(precisaMostrarGate("concedida"), false);
  assert.equal(precisaMostrarGate("verificando"), false);
  for (const s of ["perguntar", "negada", "negada_permanente", "indisponivel"] as const) {
    assert.equal(precisaMostrarGate(s), true, `${s} precisa mostrar o gate`);
  }
});

test("Abrir configurações só aparece quando o aparelho não pergunta mais", () => {
  assert.equal(ofereceConfiguracoes("negada_permanente"), true);
  assert.equal(ofereceConfiguracoes("negada"), false);
  assert.equal(ofereceConfiguracoes("perguntar"), false);
  assert.equal(ofereceConfiguracoes("concedida"), false);
});

test("o estado sobrevive a desmontar o componente", () => {
  _resetarPermissao();
  assert.equal(leituraAtual().status, "desconhecido");
  definirLeitura({ status: "concedida", origem: "nativo" });
  // Simula trocar de aba: nenhum componente montado, e o valor continua lá.
  assert.equal(leituraAtual().status, "concedida");
  assert.equal(precisaMostrarGate(leituraAtual().status), false);
  _resetarPermissao();
});

test("assinantes recebem a mudança e o cancelamento funciona", () => {
  _resetarPermissao();
  const recebidos: string[] = [];
  const cancelar = assinarPermissao((l) => recebidos.push(l.status));
  definirLeitura({ status: "perguntar", origem: "web" });
  definirLeitura({ status: "concedida", origem: "web" });
  cancelar();
  definirLeitura({ status: "negada", origem: "web" });
  assert.deepEqual(recebidos, ["perguntar", "concedida"]);
  _resetarPermissao();
});
