import test from "node:test";
import assert from "node:assert/strict";
import { reconciliarViagem, rotuloDeProtecao } from "./protecao.ts";

const base = {
  sharing: false,
  gpsOnline: true,
  viagemAtiva: false,
  temServico: false,
  servicoAtivo: false,
};

test('serviço nativo confirmado permite afirmar apenas "Viagem ativa"', () => {
  assert.equal(rotuloDeProtecao(base), "GPS ativo");
  assert.equal(rotuloDeProtecao({ ...base, gpsOnline: false }), "Sem GPS");
  assert.equal(
    rotuloDeProtecao({ ...base, viagemAtiva: true, temServico: true, servicoAtivo: false }),
    "Viagem ativa",
  );
  assert.equal(
    rotuloDeProtecao({ ...base, viagemAtiva: true, temServico: true, servicoAtivo: true }),
    "Viagem ativa",
  );
});

test("sem serviço no aparelho nenhuma proteção é prometida", () => {
  assert.equal(rotuloDeProtecao({ ...base, viagemAtiva: true }), "Viagem ativa");
});

test("compartilhamento tem prioridade sobre os demais rótulos", () => {
  assert.equal(rotuloDeProtecao({ ...base, sharing: true, gpsOnline: false }), "Compartilhando");
});

test("reconciliação tenta recuperar uma vez e depois declara desprotegido", () => {
  const entrada = { viagemAtiva: true, nativo: "inativo" as const, temServico: true };
  assert.equal(reconciliarViagem({ ...entrada, jaTentouRecuperar: false }), "tentar_recuperar");
  assert.equal(reconciliarViagem({ ...entrada, jaTentouRecuperar: true }), "declarar_desprotegido");
});

test("serviço de pé sem viagem no JS é órfão e deve ser parado", () => {
  assert.equal(
    reconciliarViagem({
      viagemAtiva: false,
      nativo: "ativo",
      jaTentouRecuperar: false,
      temServico: true,
    }),
    "parar_orfao",
  );
});

test("estado nativo desconhecido não gera conclusão", () => {
  assert.equal(
    reconciliarViagem({
      viagemAtiva: true,
      nativo: "desconhecido",
      jaTentouRecuperar: false,
      temServico: true,
    }),
    "nada",
  );
  assert.equal(
    reconciliarViagem({
      viagemAtiva: true,
      nativo: "inativo",
      jaTentouRecuperar: false,
      temServico: false,
    }),
    "nada",
  );
});
