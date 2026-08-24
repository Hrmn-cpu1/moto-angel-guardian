import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  ESPERA_COTA_S,
  diagnosticarRota,
  statusDaFalha,
  type FalhaDeRota,
} from "./directions-status.ts";
import { MAX_PONTOS_RISCO, pontosDeRiscoVisiveis } from "./map-layers.ts";

/**
 * RC5 — endurecimento sobre a base main.
 *
 * Cada teste corresponde a um defeito com cadeia causal provada no código,
 * não a uma suspeita.
 */

const RAIZ = process.cwd();
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");
const semComentarios = (t: string) =>
  t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ================================================================== *
 * 1. Heatmap: um SOS pesa uma vez
 * ================================================================== */

const MIGRACOES = join(RAIZ, "supabase/migrations");

/** Última definição vencedora de uma função, na ordem de aplicação. */
function ultimaDefinicaoDe(nomeFuncao: string): string {
  const arquivos = readdirSync(MIGRACOES)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let vencedora = "";
  for (const f of arquivos) {
    const sql = readFileSync(join(MIGRACOES, f), "utf8");
    const re = new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${nomeFuncao}\\b[\\s\\S]*?\\$\\$;`,
      "gi",
    );
    const achados = sql.match(re);
    if (achados?.length) vencedora = achados[achados.length - 1];
  }
  return vencedora;
}

test("HEAT.1: risk_heatmap ignora o espelho de SOS em community_alerts", () => {
  const sql = ultimaDefinicaoDe("risk_heatmap");
  assert.ok(sql, "risk_heatmap não encontrada em nenhuma migration");
  // O trigger da RC2-B espelha todo sos_event em community_alerts. Sem este
  // filtro, cada SOS entra duas vezes: 4 (sos_events) + 2 (espelho) = 6.
  assert.match(
    sql.toLowerCase(),
    /a\.sos_event_id\s+is\s+null/,
    "sem o filtro, todo SOS é contado duas vezes no mapa de risco",
  );
  // O ramo de sos_events continua existindo: ele é a fonte do peso do SOS.
  assert.match(sql, /from public\.sos_events/i);
});

test("HEAT.2: só existe uma fonte de peso para SOS", () => {
  const sql = ultimaDefinicaoDe("risk_heatmap").toLowerCase();
  const posAlerts = sql.indexOf("public.community_alerts");
  const posFiltro = sql.indexOf("sos_event_id is null");
  assert.ok(posAlerts >= 0 && posFiltro > posAlerts, "o filtro precisa estar no ramo dos alertas");
});

/* ================================================================== *
 * 2. Migrations: nenhuma duplicata de conteúdo
 * ================================================================== */

test("MIG.1: nenhuma migration repete o conteúdo de outra", () => {
  const arquivos = readdirSync(MIGRACOES).filter((f) => f.endsWith(".sql"));
  const porHash = new Map<string, string[]>();
  for (const f of arquivos) {
    // Normaliza espaço em branco: o que importa é o DDL, não o \n final.
    const corpo = readFileSync(join(MIGRACOES, f), "utf8").trim().replace(/\s+/g, " ");
    const h = createHash("sha256").update(corpo).digest("hex");
    porHash.set(h, [...(porHash.get(h) ?? []), f]);
  }
  const repetidas = [...porHash.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort().join(" == "));

  /* DÍVIDA REGISTRADA, NÃO PERDOADA.
   *
   * O aplicador de migrations do Lovable executou rc2b e rc2c gravando CÓPIAS
   * novas com carimbo próprio, em vez de registrar os arquivos originais.
   * Resultado: o mesmo DDL existe duas vezes no repositório sob nomes
   * diferentes. Hoje é inofensivo (todo o DDL é idempotente: CREATE OR
   * REPLACE, IF NOT EXISTS, ON CONFLICT DO NOTHING), mas é uma armadilha:
   * quem editar o arquivo de agosto/11 estará editando o que o banco NÃO
   * aplicou.
   *
   * Apagar qualquer um dos quatro é arriscado sem saber qual par está
   * registrado em supabase_migrations.schema_migrations — decisão que exige
   * o banco real. Até lá, as duas duplicatas ficam listadas aqui: uma
   * TERCEIRA reprova na hora. */
  const CONHECIDAS = [
    "20260811120000_rc2b_sos_comunitario.sql == 20260814174007_fd473902-fab6-4204-92a5-c0e7255e078b.sql",
    "20260811120100_rc2c_riders_optin.sql == 20260814174130_c78ad327-f73a-42d8-ac4a-569558d7d692.sql",
  ];
  const novas = repetidas.filter((r) => !CONHECIDAS.includes(r));
  assert.deepEqual(
    novas,
    [],
    `migration nova com conteúdo idêntico a outra: ${JSON.stringify(novas)}`,
  );
  assert.equal(repetidas.length, CONHECIDAS.length, "uma duplicata conhecida sumiu ou mudou");
});

/* ================================================================== *
 * 3. Directions: cada falha tratada pelo que ela é
 * ================================================================== */

test("DIR.1: REQUEST_DENIED não oferece 'tentar novamente'", () => {
  const d = diagnosticarRota({ code: "REQUEST_DENIED" });
  assert.equal(d.falha, "negado");
  assert.equal(d.status, "REQUEST_DENIED");
  assert.equal(d.podeTentarDeNovo, false, "repetir nunca corrige configuração de chave");
  assert.ok(!/temporar/i.test(d.mensagem), "chamar de temporário é mentira");
});

test("DIR.2: ZERO_RESULTS e NOT_FOUND são respostas definitivas", () => {
  for (const status of ["ZERO_RESULTS", "NOT_FOUND"]) {
    const d = diagnosticarRota({ status });
    assert.equal(d.falha, "sem_rota", status);
    assert.equal(d.podeTentarDeNovo, false, status);
  }
});

test("DIR.3: OVER_QUERY_LIMIT deixa repetir, mas só depois de esperar", () => {
  const d = diagnosticarRota({ code: "OVER_QUERY_LIMIT" });
  assert.equal(d.falha, "cota");
  assert.equal(d.podeTentarDeNovo, true);
  assert.equal(d.esperaS, ESPERA_COTA_S);
  assert.ok(d.esperaS > 0, "repetir na hora em cima da cota estourada só piora");
});

test("DIR.4: falha desconhecida mantém o comportamento antigo e seguro", () => {
  for (const erro of [new Error("network"), null, undefined, {}, "algo estranho"]) {
    const d = diagnosticarRota(erro);
    assert.equal(d.falha, "temporario");
    assert.equal(d.podeTentarDeNovo, true);
  }
});

test("DIR.5: o status é achado em code, status ou dentro da mensagem", () => {
  assert.equal(statusDaFalha({ code: "REQUEST_DENIED" }), "REQUEST_DENIED");
  assert.equal(statusDaFalha({ status: "zero_results" }), "ZERO_RESULTS");
  assert.equal(
    statusDaFalha(new Error("DirectionsService failed: OVER_QUERY_LIMIT")),
    "OVER_QUERY_LIMIT",
  );
  assert.equal(statusDaFalha({ message: "algo sem status" }), null);
});

test("DIR.6: nenhuma mensagem vaza jargão do Google para o motociclista", () => {
  const falhas: FalhaDeRota[] = ["negado", "sem_rota", "cota", "invalido", "temporario"];
  const erros = [
    { code: "REQUEST_DENIED" },
    { code: "ZERO_RESULTS" },
    { code: "OVER_QUERY_LIMIT" },
    { code: "INVALID_REQUEST" },
    new Error("x"),
  ];
  const vistas = new Set<string>();
  erros.forEach((e, i) => {
    const d = diagnosticarRota(e);
    assert.equal(d.falha, falhas[i]);
    assert.ok(!/_|API|key|chave|Google/i.test(d.mensagem), `mensagem técnica: ${d.mensagem}`);
    vistas.add(d.mensagem);
  });
  assert.equal(vistas.size, erros.length, "mensagem repetida esconde a causa");
});

test("DIR.7: o mapa usa o diagnóstico e nunca inventa rota", () => {
  const mapa = semComentarios(ler("src/components/RealMap.tsx"));
  assert.match(mapa, /diagnosticarRota\(error\)/);
  // Nos DOIS caminhos de falha: exception síncrona e promise rejeitada.
  assert.equal(
    (mapa.match(/diagnosticarRota\(error\)/g) ?? []).length,
    2,
    "falta classificar um dos caminhos de falha",
  );
  assert.equal(
    (mapa.match(/setDiagnostico\(d\)/g) ?? []).length,
    2,
    "o diagnóstico classificado precisa chegar ao estado da UI",
  );
  assert.match(mapa, /diagnostico\?\.podeTentarDeNovo \?\? true/);
});

test("DIR.8: falha de rota fica visível e expõe somente o status sanitizado", () => {
  const mapa = semComentarios(ler("src/components/RealMap.tsx"));
  assert.match(mapa, /top-\[calc\(var\(--ma-top\)\+112px\)\]/);
  assert.match(mapa, /z-40/);
  assert.match(mapa, /data-route-status=\{diagnostico\.status\}/);
  assert.match(mapa, /Diagnóstico da rota: \{diagnostico\.status\}/);
});

test("DIR.9: a coordenada padrão é só enquadramento de câmera, nunca posição", () => {
  const mapa = semComentarios(ler("src/components/RealMap.tsx"));
  /* DEFAULT_CENTER existe porque o mapa precisa apontar para algum lugar antes
   * do primeiro fix de GPS. Isso é aceitável. O que NÃO pode é essa
   * coordenada virar "onde o motociclista está": marcador, rota, presença ou
   * SOS. Por isso ela pode ser lida uma vez só, e só para a câmera. */
  const usos = mapa.match(/DEFAULT_CENTER/g) ?? [];
  assert.equal(usos.length, 2, "DEFAULT_CENTER usado fora do enquadramento inicial");
  assert.match(mapa, /const fallbackCenter = useMemo\(\(\) => center \?\? DEFAULT_CENTER/);
  // O marcador do usuário exige `center` real: sem GPS, ninguém é desenhado.
  assert.match(mapa, /if \(state !== "ready" \|\| !map \|\| !center\) return;/);
  assert.ok(!/onRouteRef\.current\?\.\([^)]*DEFAULT_CENTER/.test(mapa));
});

/* ================================================================== *
 * 4. Overlays do mapa: teto de objetos
 * ================================================================== */

test("PERF.1: o heatmap tem teto de pontos desenhados", () => {
  // A RPC devolve até 500 pontos e cada ponto vira uma faixa de círculos.
  const bandas = 3; // RISK_BANDS
  assert.ok(MAX_PONTOS_RISCO > 0 && MAX_PONTOS_RISCO <= 200, "teto ausente ou alto demais");
  assert.ok(
    MAX_PONTOS_RISCO * bandas <= 500,
    `${MAX_PONTOS_RISCO * bandas} overlays é muito para uma WebView de celular`,
  );
});

test("PERF.2: o teto fica com os pontos de MAIOR peso", () => {
  const pontos = Array.from({ length: 500 }, (_, i) => ({ weight: i % 7, id: i }));
  const visiveis = pontosDeRiscoVisiveis(pontos);
  assert.equal(visiveis.length, MAX_PONTOS_RISCO);
  assert.equal(visiveis[0].weight, 6, "o ponto mais grave tem de sobreviver ao corte");
  assert.ok(
    visiveis.every((p, i) => i === 0 || visiveis[i - 1].weight >= p.weight),
    "cortar sem ordenar joga fora justamente o risco mais grave",
  );
  assert.deepEqual(pontosDeRiscoVisiveis([], 10), [], "lista vazia não quebra");
  // O componente precisa usar o helper, e não uma cópia da regra.
  assert.match(
    semComentarios(ler("src/components/RealMap.tsx")),
    /pontosDeRiscoVisiveis\(riskPoints\)/,
  );
});

/* ================================================================== *
 * 5. O que este lote não podia quebrar
 * ================================================================== */

test("ESCOPO.RC5: SOS, RLS e presença seguem intactos", () => {
  const heat = ler("supabase/migrations/20260815120000_rc5_heatmap_sem_dupla_contagem.sql");
  for (const proibido of [
    "DROP TABLE",
    "DELETE FROM",
    "TRUNCATE",
    "DROP FUNCTION public.sos_open",
    "DROP POLICY",
    "ALTER TABLE public.sos_events",
  ]) {
    assert.ok(
      !heat.toUpperCase().includes(proibido.toUpperCase()),
      `migration destrutiva: ${proibido}`,
    );
  }
  // Só substitui a função de leitura, nada mais.
  assert.match(heat, /CREATE OR REPLACE FUNCTION public\.risk_heatmap/);
});
