import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { destinoInternoSeguro, nextInternoOuIndefinido } from "./redirect-seguro.ts";

/* ================================================================== *
 * P0 — risk_heatmap não pode virar janela para o histórico de SOS
 * ================================================================== */

const MIGRACOES = join(process.cwd(), "supabase/migrations");

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

const HEAT = ultimaDefinicaoDe("risk_heatmap").toLowerCase();
const ARQUIVO_RC6 = readFileSync(
  join(MIGRACOES, "20260817154757_af89700e-521b-4d06-b567-c399309ca759.sql"),
  "utf8",
).toLowerCase();

test("SEC.1: anônimo não executa risk_heatmap (grant + falha fechada)", () => {
  assert.match(ARQUIVO_RC6, /revoke all on function public\.risk_heatmap[\s\S]*from public, anon/);
  assert.match(ARQUIVO_RC6, /grant execute on function public\.risk_heatmap[\s\S]*to authenticated/);
  assert.ok(
    !/to\s+(anon|public)\s*;/.test(
      ARQUIVO_RC6.slice(ARQUIVO_RC6.indexOf("grant execute on function public.risk_heatmap")),
    ),
    "anon/PUBLIC não podem receber EXECUTE",
  );
  assert.match(HEAT, /v_uid uuid := auth\.uid\(\)/);
  assert.match(HEAT, /if v_uid is null then[\s\S]*raise exception/);
});

test("SEC.2: raio e janela são limitados no servidor, não pelo cliente", () => {
  assert.match(HEAT, /c_max_radius_km constant double precision := 25/);
  assert.match(HEAT, /c_max_days constant integer := 14/);
  assert.match(HEAT, /v_radius := least\(greatest\(coalesce\(_radius_km[\s\S]*c_max_radius_km\)/);
  assert.match(HEAT, /v_days\s+:= least\(greatest\(coalesce\(_days[\s\S]*c_max_days\)/);
  // O parâmetro cru não pode mais chegar ao filtro de distância nem ao interval.
  assert.ok(!/<=\s*greatest\(_radius_km/.test(HEAT), "o raio do cliente não pode filtrar direto");
  assert.ok(!/greatest\(_days/.test(HEAT), "a janela do cliente não pode filtrar direto");
});

test("SEC.3: coordenadas inválidas são recusadas", () => {
  assert.match(HEAT, /_lat is null or _lng is null/);
  assert.match(HEAT, /_lat < -90 or _lat > 90/);
  assert.match(HEAT, /_lng < -180 or _lng > 180/);
  assert.match(HEAT, /_lat <> _lat or _lng <> _lng/); // NaN
  assert.match(HEAT, /raise exception 'risk_heatmap: coordenadas invalidas'/);
});

test("SEC.4: resposta é agregada — sem identidade nem coordenada individual", () => {
  assert.match(HEAT, /returns table \(lat double precision, lng double precision, weight integer\)/);
  for (const proibido of ["user_id", "sos_event_id AS", "s.id", "triggered_at AS", "phone"]) {
    assert.ok(
      !HEAT.includes(`select ${proibido.toLowerCase()}`),
      `a projeção não pode expor ${proibido}`,
    );
  }
  // Nenhuma coluna identificadora na lista de retorno.
  const retorno = HEAT.slice(HEAT.indexOf("returns table"), HEAT.indexOf("language"));
  assert.ok(!/user_id|event_id|victim|phone/.test(retorno));
});

test("SEC.5: grade global fixa impede triangulação por enumeração", () => {
  // Célula ancorada em floor(coord/grid), independente do centro consultado.
  assert.match(HEAT, /c_grid\s+constant double precision := 0\.01/);
  assert.match(HEAT, /floor\(q\.lat \/ c_grid\) \* c_grid \+ c_grid \/ 2/);
  assert.match(HEAT, /floor\(q\.lng \/ c_grid\) \* c_grid \+ c_grid \/ 2/);
  // A precisão de ~110 m da versão anterior não pode voltar.
  assert.ok(!/round\(p\.lat::numeric, 3\)/.test(HEAT), "grade de 3 casas devolvia a coord original");
  // Peso saturado: a célula não revela quantos eventos existem nela.
  assert.match(HEAT, /least\(sum\(q\.w\), c_max_weight\)/);
});

test("SEC.6: heatmap legítimo continua funcionando e o RC5 continua sem dupla contagem", () => {
  assert.match(HEAT, /from public\.community_alerts a/);
  assert.match(HEAT, /a\.sos_event_id\s+is\s+null/);
  assert.match(HEAT, /from public\.sos_events s/);
  assert.match(HEAT, /security definer/);
  assert.match(HEAT, /set search_path to 'public', 'pg_temp'/);
  // Assinatura preservada: o frontend (useRiskZones) não muda.
  const hook = readFileSync(join(process.cwd(), "src/hooks/useRiskZones.ts"), "utf8");
  assert.match(hook, /_lat:[\s\S]*_lng:[\s\S]*_radius_km:[\s\S]*_days:/);
  assert.match(hook, /_radius_km: radiusKm/);
});

/* ================================================================== *
 * P1 — open redirect em login/register/splash
 * ================================================================== */

const EXTERNOS = [
  "//evil.com",
  "///evil.com",
  "/\\evil.com",
  "/\t/evil.com",
  "http://evil.com",
  "https://evil.com/x",
  "javascript:alert(1)",
  " javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,<script>",
  "%2f%2fevil.com",
  "%2F%2Fevil.com",
  "/%2f/evil.com",
  "%09//evil.com",
  "\\\\evil.com",
  "//evil.com/%2e%2e",
  "mailto:a@b.c",
  "evil.com",
  "",
  "   ",
];

test("RED.1: nenhum destino externo sobrevive", () => {
  for (const mau of EXTERNOS) {
    assert.equal(destinoInternoSeguro(mau), "/dashboard", `deveria recusar: ${JSON.stringify(mau)}`);
  }
});

test("RED.2: entradas não-string e malformadas caem no destino padrão", () => {
  for (const mau of [undefined, null, 42, {}, [], "/%E0%A4%A", "%"]) {
    assert.equal(destinoInternoSeguro(mau), "/dashboard");
  }
});

test("RED.3: rotas internas legítimas são preservadas", () => {
  assert.equal(destinoInternoSeguro("/dashboard"), "/dashboard");
  assert.equal(destinoInternoSeguro("/sos"), "/sos");
  assert.equal(destinoInternoSeguro("/map?foco=1"), "/map?foco=1");
  assert.equal(destinoInternoSeguro("/history#hoje"), "/history#hoje");
  assert.equal(destinoInternoSeguro("/contacts"), "/contacts");
});

test("RED.4: nextInternoOuIndefinido devolve undefined em vez de destino falso", () => {
  assert.equal(nextInternoOuIndefinido("//evil.com"), undefined);
  assert.equal(nextInternoOuIndefinido(undefined), undefined);
  assert.equal(nextInternoOuIndefinido("/alerts"), "/alerts");
});

test("RED.5: login, register e splash usam o validador único", () => {
  const arquivos = ["src/routes/login.tsx", "src/routes/register.tsx", "src/routes/index.tsx"];
  for (const a of arquivos) {
    const src = readFileSync(join(process.cwd(), a), "utf8");
    assert.match(src, /redirect-seguro/, `${a} precisa usar o validador único`);
    assert.ok(
      !/next\s*&&\s*next\.startsWith\("\/"\)/.test(src),
      `${a} ainda confia em startsWith("/")`,
    );
  }
});

test("RED.6: o next guardado para o OAuth do Google também é validado", () => {
  const src = readFileSync(join(process.cwd(), "src/hooks/useAuth.ts"), "utf8");
  assert.match(src, /nextInternoOuIndefinido\(nextPath\)/);
  assert.ok(
    !/sessionStorage\.setItem\("moto_anjo_next", nextPath\)/.test(src),
    "não pode guardar o valor cru",
  );
  // Fluxos preservados.
  assert.match(src, /lovable\.auth\.signInWithOAuth\("google"/);
  assert.match(src, /signInWithGoogleNative\(\)/);
});
