import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMADAS_PADRAO,
  CHAVE_CAMADAS,
  carregarCamadas,
  consultasHabilitadas,
  rotuloDeRiders,
  salvarCamadas,
  type ArmazenamentoSimples,
} from "./map-layers.ts";

/** Storage falso: testa a persistência sem navegador. */
function storageFalso(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  const store: ArmazenamentoSimples = {
    getItem: (k) => dados[k] ?? null,
    setItem: (k, v) => {
      dados[k] = v;
    },
  };
  return { store, dados };
}

test("o padrão de fábrica não liga a camada comunitária sozinho", () => {
  assert.equal(
    CAMADAS_PADRAO.comunidade,
    false,
    "ver desconhecidos precisa ser escolha do usuário",
  );
  assert.equal(CAMADAS_PADRAO.contatos, true, "contatos já foram autorizados um a um");
});

test("P0.4-C.8: camada comunitária OFF não consulta o servidor", () => {
  const h = consultasHabilitadas({ comunidade: false, contatos: true }, true);
  assert.equal(h.comunidade, false, "OFF não pode nem consultar online_riders");
  assert.equal(h.contatos, true);
});

test("P0.4-C.9: camada comunitária ON habilita a consulta", () => {
  const h = consultasHabilitadas({ comunidade: true, contatos: true }, true);
  assert.equal(h.comunidade, true);
});

test("P0.4-C.10: contatos autorizados não dependem do toggle da comunidade", () => {
  const comOff = consultasHabilitadas({ comunidade: false, contatos: true }, true);
  const comOn = consultasHabilitadas({ comunidade: true, contatos: true }, true);
  assert.equal(comOff.contatos, true);
  assert.equal(comOn.contatos, true);
});

test("sem posição, nenhuma camada consulta", () => {
  const h = consultasHabilitadas({ comunidade: true, contatos: true }, false);
  assert.deepEqual(h, { comunidade: false, contatos: false });
});

test("a preferência sobrevive ao fechar o app", () => {
  const { store, dados } = storageFalso();
  salvarCamadas({ comunidade: true, contatos: true }, store);
  assert.ok(dados[CHAVE_CAMADAS], "nada foi persistido");
  assert.deepEqual(carregarCamadas(store), { comunidade: true, contatos: true });
});

test("sem storage (modo privado), vale o padrão e nada quebra", () => {
  assert.deepEqual(carregarCamadas(null), CAMADAS_PADRAO);
  assert.doesNotThrow(() => salvarCamadas({ comunidade: true, contatos: false }, null));
});

test("valor corrompido no storage não derruba o mapa nem liga a comunidade", () => {
  const { store } = storageFalso({ [CHAVE_CAMADAS]: "{isso não é json" });
  assert.deepEqual(carregarCamadas(store), CAMADAS_PADRAO);

  const parcial = storageFalso({ [CHAVE_CAMADAS]: '{"comunidade":"talvez"}' });
  assert.equal(
    carregarCamadas(parcial.store).comunidade,
    false,
    "valor inválido cai no lado seguro",
  );
});

test("o rótulo do mapa separa contato de comunidade e some quando vazio", () => {
  assert.equal(
    rotuloDeRiders({ comunidade: true, contatos: true }, 2, 3),
    "2 contatos · 3 na comunidade",
  );
  assert.equal(rotuloDeRiders({ comunidade: true, contatos: true }, 1, 0), "1 contato");
  assert.equal(rotuloDeRiders({ comunidade: true, contatos: true }, 0, 4), "4 na comunidade");
  assert.equal(
    rotuloDeRiders({ comunidade: false, contatos: true }, 0, 9),
    null,
    "camada OFF não conta",
  );
  assert.equal(rotuloDeRiders({ comunidade: true, contatos: true }, 0, 0), null);
});
