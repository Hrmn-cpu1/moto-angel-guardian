import test from "node:test";
import assert from "node:assert/strict";
import {
  abrirNavegacaoExterna,
  abrirPontoExterno,
  coordenadaValida,
  destinoUtilizavel,
  normalizarDestino,
  urlDeNavegacao,
  urlDePonto,
  type PonteExterna,
} from "./external-navigation.ts";

/** Ponte falsa: registra o que foi tentado, sem navegador e sem Android. */
function ponteFalsa(op: { nativo?: boolean; janelaAbre?: boolean; browserFalha?: boolean } = {}) {
  const chamadas: string[] = [];
  const ponte: PonteExterna = {
    nativo: () => op.nativo ?? false,
    abrirJanela: (url) => {
      chamadas.push(`janela:${url}`);
      return op.janelaAbre ?? true;
    },
    abrirNavegadorNativo: async (url) => {
      chamadas.push(`browser:${url}`);
      if (op.browserFalha) throw new Error("plugin indisponível");
    },
  };
  return { ponte, chamadas };
}

/* ================================================================== *
 * Coordenadas
 * ================================================================== */

test("coordenada válida aceita São Paulo e recusa lixo", () => {
  assert.equal(coordenadaValida(-23.96507, -46.30841), true);
  assert.equal(coordenadaValida(0, 0), false, "Null Island não é destino");
  assert.equal(coordenadaValida(91, 0), false);
  assert.equal(coordenadaValida(0, 181), false);
  assert.equal(coordenadaValida(NaN, 10), false);
  assert.equal(coordenadaValida(Infinity, 10), false);
  assert.equal(coordenadaValida(undefined, undefined), false);
});

/* ================================================================== *
 * Parser de destino
 * ================================================================== */

test("geo: com coordenada", () => {
  const d = normalizarDestino("geo:-23.96507,-46.30841");
  assert.deepEqual([d?.latitude, d?.longitude], [-23.96507, -46.30841]);
});

test("geo:0,0?q=endereço vira endereço, não Null Island", () => {
  const d = normalizarDestino("geo:0,0?q=Avenida Paulista 1000");
  assert.equal(d?.address, "Avenida Paulista 1000");
  assert.equal(d?.latitude, undefined);
});

test("geo com rótulo entre parênteses preserva o rótulo", () => {
  const d = normalizarDestino("geo:0,0?q=-23.5,-46.6(Cliente)");
  assert.equal(d?.latitude, -23.5);
  assert.equal(d?.label, "Cliente");
});

test("par de coordenadas puro", () => {
  const d = normalizarDestino(" -23.5, -46.6 ");
  assert.deepEqual([d?.latitude, d?.longitude], [-23.5, -46.6]);
});

test("URL do Google Maps com destination", () => {
  const d = normalizarDestino("https://www.google.com/maps/dir/?api=1&destination=-23.55,-46.63");
  assert.deepEqual([d?.latitude, d?.longitude], [-23.55, -46.63]);
});

test("URL do Google Maps com @lat,lng no caminho", () => {
  const d = normalizarDestino("https://www.google.com/maps/@-23.55,-46.63,15z");
  assert.deepEqual([d?.latitude, d?.longitude], [-23.55, -46.63]);
});

test("URL do Waze", () => {
  const d = normalizarDestino("https://www.waze.com/ul?ll=-23.55,-46.63&navigate=yes");
  assert.deepEqual([d?.latitude, d?.longitude], [-23.55, -46.63]);
});

test("endereço em texto puro é aceito", () => {
  const d = normalizarDestino("Rua da Consolação 2000, São Paulo");
  assert.equal(d?.address, "Rua da Consolação 2000, São Paulo");
});

test("entrada perigosa é recusada", () => {
  for (const perigo of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>",
    "file:///etc/passwd",
    "intent://scan/#Intent;scheme=zxing;end",
    "content://com.android/x",
    "vbscript:msgbox",
  ]) {
    assert.equal(normalizarDestino(perigo), null, `${perigo} não pode passar`);
  }
});

test("entrada vazia, malformada ou alheia é recusada", () => {
  assert.equal(normalizarDestino(""), null);
  assert.equal(normalizarDestino("   "), null);
  assert.equal(normalizarDestino("ab"), null, "texto curto demais não é endereço");
  assert.equal(normalizarDestino(null), null);
  assert.equal(normalizarDestino(42), null);
  assert.equal(normalizarDestino("https://exemplo-aleatorio.com/pagina"), null);
  assert.equal(normalizarDestino("geo:999,999"), null, "coordenada fora de faixa");
  assert.equal(normalizarDestino("x".repeat(3000)), null, "entrada gigante");
});

test("objeto já normalizado passa; objeto vazio não", () => {
  assert.equal(normalizarDestino({ latitude: -23.5, longitude: -46.6 })?.latitude, -23.5);
  assert.equal(normalizarDestino({}), null);
  assert.equal(normalizarDestino({ latitude: 0, longitude: 0 }), null);
});

test("destinoUtilizavel exige coordenada ou endereço de verdade", () => {
  assert.equal(destinoUtilizavel(null), false);
  assert.equal(destinoUtilizavel({ address: "  " }), false);
  assert.equal(destinoUtilizavel({ address: "Rua X 1" }), true);
  assert.equal(destinoUtilizavel({ latitude: -23.5, longitude: -46.6 }), true);
});

/* ================================================================== *
 * URLs — nunca intent://
 * ================================================================== */

test("nenhuma URL gerada usa esquema proprietário", () => {
  const destinos = [{ latitude: -23.5, longitude: -46.6 }, { address: "Avenida Paulista 1000" }];
  for (const destino of destinos) {
    for (const provider of ["google", "waze"] as const) {
      const url = urlDeNavegacao(provider, destino);
      assert.ok(url.startsWith("https://"), `${provider} precisa ser https: ${url}`);
      assert.ok(!url.includes("intent://"), "intent:// nunca pode ser construído");
      assert.ok(!url.startsWith("geo:"), "geo: não pode ir para a WebView");
    }
    assert.ok(!urlDePonto(destino).includes("intent://"));
  }
});

test("URL do Google usa a forma universal com api=1", () => {
  const url = urlDeNavegacao("google", { latitude: -23.5, longitude: -46.6 });
  assert.ok(url.includes("/maps/dir/?api=1"));
  assert.ok(url.includes("destination=-23.5%2C-46.6"));
});

test("URL do Waze pede navegação e aceita endereço", () => {
  assert.ok(urlDeNavegacao("waze", { latitude: -23.5, longitude: -46.6 }).includes("navigate=yes"));
  assert.ok(urlDeNavegacao("waze", { address: "Rua X 1" }).includes("q=Rua%20X%201"));
});

test("provider motoanjo fica dentro do app", () => {
  const url = urlDeNavegacao("motoanjo", { latitude: -23.5, longitude: -46.6 });
  assert.ok(url.startsWith("/mapa?destino="));
});

test("endereço com acento e espaço é escapado", () => {
  const url = urlDeNavegacao("google", { address: "Rua da Consolação 2000" });
  assert.ok(!url.includes(" "), "URL não pode conter espaço cru");
  assert.ok(url.includes("Consola%C3%A7%C3%A3o"));
});

/* ================================================================== *
 * Contrato de abertura — a WebView nunca navega no lugar
 * ================================================================== */

test("abre pela janela do sistema e não toca no navegador nativo", async () => {
  const { ponte, chamadas } = ponteFalsa({ nativo: true, janelaAbre: true });
  const r = await abrirNavegacaoExterna("google", { latitude: -23.5, longitude: -46.6 }, ponte);
  assert.equal(r.ok, true);
  assert.equal(r.via, "janela");
  assert.equal(chamadas.length, 1, "não pode abrir duas vezes");
  assert.ok(chamadas[0].startsWith("janela:https://"));
});

test("no aparelho, se a janela não abrir, cai para o navegador nativo", async () => {
  const { ponte, chamadas } = ponteFalsa({ nativo: true, janelaAbre: false });
  const r = await abrirNavegacaoExterna("waze", { latitude: -23.5, longitude: -46.6 }, ponte);
  assert.equal(r.ok, true);
  assert.equal(r.via, "navegador-nativo");
  assert.deepEqual(
    chamadas.map((c) => c.split(":")[0]),
    ["janela", "browser"],
  );
});

test("se os dois caminhos falharem, devolve erro em vez de fingir sucesso", async () => {
  const { ponte } = ponteFalsa({ nativo: true, janelaAbre: false, browserFalha: true });
  const r = await abrirNavegacaoExterna("google", { latitude: -23.5, longitude: -46.6 }, ponte);
  assert.equal(r.ok, false);
  assert.equal(r.via, "nenhum");
});

test("destino inválido nem chega a abrir nada", async () => {
  const { ponte, chamadas } = ponteFalsa({ nativo: true });
  for (const ruim of [null, { latitude: 0, longitude: 0 }, { address: " " }]) {
    const r = await abrirNavegacaoExterna("google", ruim, ponte);
    assert.equal(r.ok, false);
    assert.equal(r.url, "");
  }
  assert.deepEqual(chamadas, [], "nada pode ser aberto com destino inválido");
});

test("nenhuma URL entregue à ponte é intent:// ou geo:", async () => {
  const { ponte, chamadas } = ponteFalsa({ nativo: true, janelaAbre: true });
  await abrirNavegacaoExterna("google", { latitude: -23.5, longitude: -46.6 }, ponte);
  await abrirNavegacaoExterna("waze", { address: "Rua X 1" }, ponte);
  await abrirPontoExterno({ latitude: -23.5, longitude: -46.6 }, ponte);
  assert.equal(chamadas.length, 3);
  for (const c of chamadas) {
    const url = c.slice(c.indexOf(":") + 1);
    assert.ok(url.startsWith("https://"), `entregue à ponte precisa ser https: ${url}`);
    assert.ok(!url.includes("intent://"));
  }
});
