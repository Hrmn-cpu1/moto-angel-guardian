import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Regressão do P0.2 — `column reference "request_id" is ambiguous`.
 *
 * Em PL/pgSQL, cada coluna declarada em RETURNS TABLE (...) também vira uma
 * variável dentro do corpo da função. Se o corpo referenciar uma coluna com o
 * mesmo nome sem qualificar (`WHERE request_id = ...` em vez de
 * `WHERE se.request_id = ...`), o Postgres recusa a instrução em tempo de
 * EXECUÇÃO — a função é criada sem reclamar e só quebra quando alguém aciona o
 * SOS de verdade. Foi exatamente o que aconteceu no teste físico.
 *
 * Este arquivo varre as migrations, monta a definição EFETIVA de cada função
 * (a última que o banco aplicou vence) e falha se qualquer nome de coluna de
 * retorno aparecer sem alias no corpo.
 *
 * Limite conhecido e proposital: a varredura ignora o interior de `SET ... =`
 * porque ali o nome é alvo de atribuição e não sofre substituição de variável.
 */

const RAIZ = process.cwd();
const DIR = "supabase/migrations";

const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");
const arquivosSql = () =>
  readdirSync(join(RAIZ, DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

const MIGRATION_P02 = "20260811090000_sos_rpc_ambiguidade_coluna.sql";

type Funcao = {
  nome: string;
  args: string;
  retorno: string;
  linguagem: string;
  corpo: string;
  arquivo: string;
};

const BLOCO =
  /CREATE OR REPLACE FUNCTION\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\s\S]*?)\s+LANGUAGE\s+(\w+)[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$;/gi;

/** Definição efetiva de cada função: a última migration a definir vence. */
function definicoesEfetivas(): Map<string, Funcao> {
  const efetivas = new Map<string, Funcao>();
  for (const arquivo of arquivosSql()) {
    const sql = ler(join(DIR, arquivo));
    for (const m of sql.matchAll(BLOCO)) {
      efetivas.set(m[1], {
        nome: m[1],
        args: m[2],
        retorno: m[3],
        linguagem: m[4].toLowerCase(),
        corpo: m[5],
        arquivo,
      });
    }
  }
  return efetivas;
}

function colunasDeRetorno(retorno: string): string[] {
  const m = /^\s*TABLE\s*\(([\s\S]*)\)\s*$/i.exec(retorno.trim());
  if (!m) return [];
  return m[1]
    .split(",")
    .map((parte) => /^\s*(\w+)/.exec(parte)?.[1])
    .filter((n): n is string => Boolean(n));
}

/** Remove o que não é referência de coluna, para não gerar alarme falso. */
function apenasReferenciasDeColuna(corpo: string): string {
  return (
    corpo
      .replace(/--[^\n]*/g, " ") // comentários
      .replace(/'(?:[^']|'')*'/g, "''") // literais de texto
      .replace(/INSERT\s+INTO\s+[\w.]+\s*(?:AS\s+\w+\s*)?\([^)]*\)/gi, "INSERT") // lista de destino
      .replace(/\bSET\b[\s\S]*?(?=\bWHERE\b|\bRETURNING\b|;)/gi, " ") // alvos de atribuição
      .replace(/\bAS\s+\w+/gi, " ") // apelidos declarados
  );
}

function ocorrenciasNuas(corpo: string, nome: string): string[] {
  const limpo = apenasReferenciasDeColuna(corpo);
  const re = new RegExp(`(?<![.\\w])${nome}(?![\\w])`, "g");
  return [...limpo.matchAll(re)].map((m) =>
    limpo.slice(Math.max(0, m.index - 60), m.index + nome.length + 10).replace(/\s+/g, " "),
  );
}

/* ================================================================== *
 * A regressão em si
 * ================================================================== */

test("nenhuma função plpgsql referencia coluna homônima da própria RETURNS TABLE", () => {
  const problemas: string[] = [];
  for (const f of definicoesEfetivas().values()) {
    if (f.linguagem !== "plpgsql") continue;
    for (const coluna of colunasDeRetorno(f.retorno)) {
      for (const trecho of ocorrenciasNuas(f.corpo, coluna)) {
        problemas.push(`${f.nome} (${f.arquivo}): "${coluna}" sem alias em ...${trecho}...`);
      }
    }
  }
  assert.deepEqual(problemas, [], `referência ambígua entre coluna e variável:\n${problemas.join("\n")}`);
});

test("a linha exata que derrubou o SOS no Samsung está qualificada", () => {
  const sosOpen = definicoesEfetivas().get("sos_open");
  assert.ok(sosOpen, "sos_open sumiu das migrations");
  assert.ok(
    /WHERE\s+se\.request_id\s*=\s*_request_id/i.test(sosOpen.corpo),
    "a busca por request_id precisa usar alias explícito",
  );
  assert.ok(
    !/WHERE\s+request_id\s*=\s*_request_id/i.test(sosOpen.corpo),
    "voltou a versão sem alias que o Postgres recusa",
  );
});

test("sos_cancel e sos_resolve não repetem a mesma armadilha", () => {
  const efetivas = definicoesEfetivas();
  for (const nome of ["sos_cancel", "sos_resolve"]) {
    const f = efetivas.get(nome);
    assert.ok(f, `${nome} sumiu das migrations`);
    assert.ok(
      !/\bAND\s+status\s+NOT\s+IN\b/i.test(f.corpo),
      `${nome} ainda compara status sem alias`,
    );
    assert.ok(/se\.status\s+NOT\s+IN/i.test(f.corpo), `${nome} precisa qualificar se.status`);
  }
});

/* ================================================================== *
 * A correção não pode ter mudado o contrato nem as garantias
 * ================================================================== */

test("a assinatura pública de sos_open continua a mesma", () => {
  const f = definicoesEfetivas().get("sos_open")!;
  const nomes = [...f.args.matchAll(/(_\w+)\s+\w/g)].map((m) => m[1]);
  assert.deepEqual(nomes, ["_request_id", "_lat", "_lng", "_accuracy_m", "_fix_age_ms", "_note"]);
  assert.deepEqual(colunasDeRetorno(f.retorno), [
    "sos_event_id",
    "request_id",
    "status",
    "triggered_at",
    "reused",
    "queued",
  ]);
});

test("as garantias do SOS sobreviveram à correção", () => {
  const corpo = definicoesEfetivas().get("sos_open")!.corpo;
  assert.ok(/pg_advisory_xact_lock/i.test(corpo), "sumiu a serialização por usuário");
  assert.ok(/WHEN\s+unique_violation/i.test(corpo), "sumiu o tratamento de concorrência");
  assert.ok(/SOS_ENCERRADO/.test(corpo), "sumiu a recusa de request_id já encerrado");
  assert.ok(/ON CONFLICT DO NOTHING/i.test(corpo), "sumiu a proteção da fila do WhatsApp");
  assert.ok(/se\.status\s*=\s*'active'/i.test(corpo), "sumiu a regra de um SOS ativo por usuário");
  assert.ok(
    /INSERT INTO public\.whatsapp_notifications/i.test(corpo),
    "sumiu o enfileiramento dos contatos",
  );
});

test("sos_cancel continua cancelando a fila que ainda não saiu", () => {
  const corpo = definicoesEfetivas().get("sos_cancel")!.corpo;
  assert.ok(/UPDATE public\.whatsapp_notifications/i.test(corpo));
  assert.ok(/wn\.status\s+IN\s*\(\s*''\s*,\s*''\s*\)|wn\.status\s+IN/i.test(corpo));
});

/* ================================================================== *
 * A migration é aditiva
 * ================================================================== */

test("a correção veio em migration nova, sem reescrever nenhuma aplicada", () => {
  const arquivos = arquivosSql();
  assert.ok(arquivos.includes(MIGRATION_P02), "a migration do P0.2 não está na pasta");
  // O que importa não é ser a última migration do projeto — é rodar DEPOIS
  // da que define sos_open, senão a definição ambígua voltaria a valer.
  const definemSosOpen = arquivos.filter((f) =>
    /CREATE OR REPLACE FUNCTION\s+public\.sos_open/i.test(ler(join(DIR, f))),
  );
  assert.equal(
    definemSosOpen[definemSosOpen.length - 1],
    MIGRATION_P02,
    "a definição efetiva de sos_open precisa ser a do P0.2",
  );
});

test("a migration do P0.2 não derruba nada", () => {
  const sql = ler(join(DIR, MIGRATION_P02)).toUpperCase();
  assert.ok(!sql.includes("DROP TABLE"));
  assert.ok(!sql.includes("DROP COLUMN"));
  assert.ok(!sql.includes("DROP FUNCTION"));
  assert.ok(!sql.includes("TRUNCATE"));
  assert.ok(!sql.includes("DELETE FROM"));
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION"), "a migration precisa substituir o corpo");
});
