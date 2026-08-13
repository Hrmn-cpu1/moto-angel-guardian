import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Testes estruturais.
 *
 * Os testes de `sos-client.test.ts` provam que as REGRAS estão certas. Estes
 * aqui provam que as regras estão realmente LIGADAS: que os três acionadores
 * passaram a usar o fluxo único e que as garantias prometidas existem mesmo
 * no SQL. Sem isso, alguém pode reintroduzir um caminho paralelo amanhã e a
 * suíte continuaria verde.
 */

const RAIZ = process.cwd();
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const ACIONADORES = [
  "src/components/SosFab.tsx",
  "src/components/MapSosButton.tsx",
  "src/routes/_authenticated/sos.tsx",
];

/* ================================================================== *
 * Unificação dos três acionadores
 * ================================================================== */

test("os três acionadores usam o mesmo hook", () => {
  for (const arquivo of ACIONADORES) {
    const src = ler(arquivo);
    assert.ok(src.includes("useSosController"), `${arquivo} não usa o controlador compartilhado`);
  }
});

test("nenhum acionador fala com o servidor por conta própria", () => {
  for (const arquivo of ACIONADORES) {
    const src = ler(arquivo);
    assert.ok(!src.includes("triggerSos("), `${arquivo} ainda chama triggerSos direto`);
    assert.ok(
      !src.includes("dispatchSosNotifications"),
      `${arquivo} ainda dispara envios por fora do fluxo`,
    );
    assert.ok(
      !src.includes('from("sos_events")'),
      `${arquivo} ainda escreve em sos_events por fora do fluxo`,
    );
    assert.ok(!src.includes("supabase.rpc"), `${arquivo} ainda chama RPC por fora do fluxo`);
  }
});

test("nenhum acionador captura GPS ou monta mensagem por conta própria", () => {
  for (const arquivo of ACIONADORES) {
    const src = ler(arquivo);
    assert.ok(!src.includes("useGeolocation"), `${arquivo} ainda captura GPS sozinho`);
    assert.ok(!src.includes("getCurrentPosition"), `${arquivo} ainda chama o GPS direto`);
    assert.ok(!src.includes("wa.me"), `${arquivo} ainda monta link de WhatsApp sozinho`);
  }
});

test("nenhum acionador recebe posição pronta por prop", () => {
  // A posição que já estava na tela pode ter minutos de idade. O acionamento
  // precisa de um fix novo, capturado no instante do toque.
  for (const arquivo of ACIONADORES) {
    const src = ler(arquivo);
    assert.ok(
      !/position\s*:\s*\{\s*lat/.test(src),
      `${arquivo} ainda aceita uma posição pronta vinda de fora`,
    );
  }
});

test("os pontos de uso não passam mais a posição antiga", () => {
  const dashboard = ler("src/routes/_authenticated/dashboard.tsx");
  const mapa = ler("src/routes/_authenticated/map.tsx");
  // A garantia é sobre LOCALIZAÇÃO: o acionador captura o GPS na hora do
  // acionamento e nunca recebe uma posição pronta de fora, que poderia estar
  // velha. Props de apresentação (esconder atrás de um modal) e o
  // controlador compartilhado não violam isso.
  const usoDoFab = dashboard.match(/<SosFab[A-Za-z]*[^>]*\/>/)?.[0] ?? "";
  assert.ok(usoDoFab.length > 0, "dashboard não renderiza o acionador de SOS");
  assert.ok(
    !/\b(position|lat|lng|coords|localizacao)\b/.test(usoDoFab),
    "dashboard ainda passa uma posição pronta para o SosFab",
  );
  assert.ok(mapa.includes("<MapSosButton />"), "mapa ainda passa prop para o MapSosButton");
});

test("o SOS não publica a localização da vítima na comunidade", () => {
  for (const arquivo of [...ACIONADORES, "src/hooks/useSosController.ts"]) {
    const src = ler(arquivo);
    assert.ok(!src.includes("useAlerts"), `${arquivo} publica alerta na comunidade`);
    assert.ok(!src.includes("createAlert"), `${arquivo} publica alerta na comunidade`);
    assert.ok(
      !src.includes('from("community_alerts")'),
      `${arquivo} escreve na comunidade durante um SOS`,
    );
  }
});

test("o tempo de pressão é o mesmo nos três — 3 segundos", () => {
  const botao = ler("src/components/SosHoldButton.tsx");
  assert.ok(botao.includes("SOS_HOLD_MS"), "o botão precisa usar a constante compartilhada");
  const cliente = ler("src/lib/sos-client.ts");
  assert.ok(/export const SOS_HOLD_MS = 3000;/.test(cliente), "SOS_HOLD_MS precisa valer 3000 ms");
  for (const arquivo of ACIONADORES) {
    const src = ler(arquivo);
    assert.ok(!/HOLD_MS\s*=\s*\d+/.test(src), `${arquivo} define um tempo de pressão próprio`);
  }
});

/* ================================================================== *
 * O fluxo compartilhado implementa o que foi prometido
 * ================================================================== */

test("o controlador trava chamadas simultâneas com ref, não com state", () => {
  const src = ler("src/hooks/useSosController.ts");
  assert.ok(src.includes("inFlightRef"), "falta o lock de concorrência");
  assert.ok(
    src.includes("inFlightRef.current = true"),
    "o lock precisa ser fechado antes do primeiro await",
  );
  assert.ok(src.includes("guardTrigger"), "o porteiro compartilhado precisa ser chamado");
});

test("o controlador captura GPS novo e valida o fix antes de registrar", () => {
  const src = ler("src/hooks/useSosController.ts");
  const posCapture = src.indexOf("await capture()");
  // Procura a CHAMADA, não a linha de import no topo do arquivo.
  const posValida = src.indexOf("validateSosFix({");
  const posRegistro = src.indexOf("await triggerSos(");
  assert.ok(posCapture > 0, "falta a captura de GPS");
  assert.ok(posValida > posCapture, "a validação precisa vir depois da captura");
  assert.ok(posRegistro > posValida, "o registro precisa vir depois da validação");
});

test("o controlador trata GPS negado, falta de internet e ausência de contatos", () => {
  const src = ler("src/hooks/useSosController.ts");
  assert.ok(src.includes("gps_recusado"), "falta o tratamento de GPS negado");
  assert.ok(src.includes("navigator.onLine === false"), "falta o tratamento de falta de internet");
  assert.ok(src.includes("sem_internet"), "falta o estado de falta de internet");
  assert.ok(src.includes("sem_contatos"), "falta o tratamento de usuário sem contatos");
});

test("o controlador reaproveita o request_id numa retentativa", () => {
  const src = ler("src/hooks/useSosController.ts");
  assert.ok(src.includes("pendingRequestIdRef"), "falta guardar o request_id entre tentativas");
  assert.ok(
    src.includes("pendingRequestIdRef.current ?? newRequestId()"),
    "o retry precisa reusar o mesmo request_id",
  );
});

test("o controlador recupera SOS ativo e persiste o cancelamento", () => {
  const src = ler("src/hooks/useSosController.ts");
  assert.ok(src.includes("sos_active_event"), "falta consultar o SOS ativo no banco");
  assert.ok(src.includes("loadActiveSos"), "falta a recuperação imediata pelo snapshot local");
  assert.ok(src.includes("sos_cancel"), "o cancelamento precisa ser persistido no banco");
  assert.ok(
    src.includes("O servidor não confirmou o cancelamento"),
    "cancelamento sem confirmação não pode ser dado como feito",
  );
});

/** Remove comentários para que a checagem olhe só o que a tela realmente mostra. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("o painel nunca afirma entrega fora do estado confirmado", () => {
  const painel = semComentarios(ler("src/components/SosPanel.tsx"));
  assert.ok(painel.includes("sosDeliveryLabel"), "o painel precisa usar os rótulos honestos");
  assert.ok(
    !/entregue|recebeu|chegou ao destino/i.test(painel),
    "o painel escreveu texto próprio de entrega em vez de usar o rótulo controlado",
  );
});

test("nenhum acionador afirma entrega com texto próprio", () => {
  for (const arquivo of [...ACIONADORES, "src/hooks/useSosController.ts"]) {
    const src = semComentarios(ler(arquivo));
    assert.ok(!/entregue/i.test(src), `${arquivo} afirma entrega por conta própria`);
  }
});

test("o servidor não promove 'aceito pela API' a entrega", () => {
  const src = ler("src/lib/sos.functions.ts");
  assert.ok(src.includes("accepted"), "o resultado do envio se chama accepted, não delivered");
  assert.ok(!/status:\s*['"]delivered['"]/.test(src), "o servidor não pode gravar delivered");
});

/* ================================================================== *
 * Garantias que precisam existir no banco
 * ================================================================== */

const DIR_MIGRATIONS = "supabase/migrations";

// As migrations do checkpoint foram aplicadas neste projeto com carimbo de
// data próprio, então elas são identificadas pelo cabeçalho do arquivo e não
// pelo prefixo do nome.
function arquivosSql(): string[] {
  return readdirSync(join(RAIZ, DIR_MIGRATIONS))
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function ehCheckpoint(f: string, marca: "1" | "1B" | "qualquer"): boolean {
  const sql = ler(join(DIR_MIGRATIONS, f));
  const um = /CHECKPOINT 1 —/.test(sql);
  const umB = /CHECKPOINT 1B —/.test(sql);
  // P0.2 corrigiu a ambiguidade de coluna nas RPCs do SOS. Também é migration
  // nossa, então não pode ser contada entre as 23 pré-existentes.
  const p02 = /CHECKPOINT P0\.2 —/.test(sql);
  // RC2 também são migrations nossas: não podem ser contadas entre as 23
  // pré-existentes nem confundidas com o checkpoint 1/1B.
  const rc2 = /CHECKPOINT RC2-/.test(sql);
  if (marca === "1") return um;
  if (marca === "1B") return umB;
  return um || umB || p02 || rc2;
}

function sqlNovo(): string {
  const arquivos = arquivosSql().filter((f) => ehCheckpoint(f, "qualquer"));
  assert.ok(arquivos.length >= 2, "as migrations novas do checkpoint 1 não estão lá");
  return arquivos.map((f) => ler(join(DIR_MIGRATIONS, f))).join("\n");
}

test("as migrations antigas não foram tocadas", () => {
  const antigas = arquivosSql().filter((f) => !ehCheckpoint(f, "qualquer"));
  assert.equal(antigas.length, 23, "o número de migrations pré-existentes mudou");
});

test("as migrations novas são aditivas: nada de DROP TABLE nem ALTER destrutivo", () => {
  const sql = sqlNovo().toUpperCase();
  assert.ok(!sql.includes("DROP TABLE"), "migration derruba tabela");
  assert.ok(!sql.includes("DROP COLUMN"), "migration derruba coluna");
  assert.ok(!sql.includes("TRUNCATE"), "migration trunca tabela");
});

test("o banco garante request_id único", () => {
  const sql = sqlNovo();
  assert.ok(/CREATE UNIQUE INDEX[^;]*ux_sos_events_request_id/i.test(sql));
});

test("o banco garante no máximo um SOS ativo por usuário", () => {
  const sql = sqlNovo();
  assert.ok(
    /CREATE UNIQUE INDEX[^;]*ux_sos_events_um_ativo_por_usuario[\s\S]*?WHERE status = 'active'/i.test(
      sql,
    ),
    "falta o índice parcial único de SOS ativo",
  );
});

test("cancelamento e resolução ficam carimbados no banco", () => {
  const sql = sqlNovo();
  assert.ok(/cancelled_at/i.test(sql) && /resolved_at/i.test(sql));
  assert.ok(/FUNCTION public\.sos_cancel/i.test(sql));
  assert.ok(/FUNCTION public\.sos_resolve/i.test(sql));
});

test("a fila impede notificação duplicada para o mesmo contato", () => {
  const sql = sqlNovo();
  assert.ok(
    /CREATE UNIQUE INDEX[^;]*ux_wn_evento_contato/i.test(sql),
    "falta a restrição por contato",
  );
  assert.ok(
    /CREATE UNIQUE INDEX[^;]*ux_wn_evento_telefone/i.test(sql),
    "falta a restrição por número de telefone",
  );
});

test("existe claim atômico antes de qualquer envio externo", () => {
  const sql = sqlNovo();
  assert.ok(/FUNCTION public\.claim_sos_notifications/i.test(sql), "falta a função de claim");
  assert.ok(/FOR UPDATE SKIP LOCKED/i.test(sql), "o claim precisa usar FOR UPDATE SKIP LOCKED");
  assert.ok(
    /GRANT EXECUTE ON FUNCTION public\.claim_sos_notifications[\s\S]*?TO service_role/i.test(sql),
    "o claim só pode ser executado pelo servidor",
  );
});

test("o servidor faz o claim ANTES de chamar a API externa", () => {
  const src = ler("src/lib/sos.functions.ts");
  const posClaim = src.indexOf("claim_sos_notifications");
  const posEnvio = src.indexOf("sendWhatsAppText(");
  assert.ok(posClaim > 0, "o servidor não faz claim");
  assert.ok(posEnvio > posClaim, "a chamada externa não pode vir antes do claim");
});

test("só o webhook pode gravar delivered", () => {
  const sql = sqlNovo();
  assert.ok(/FUNCTION public\.mark_sos_notification_delivered/i.test(sql));
  assert.ok(
    /REVOKE ALL ON FUNCTION public\.mark_sos_notification_delivered[\s\S]*?authenticated/i.test(
      sql,
    ),
    "o app não pode executar a função de confirmação de entrega",
  );
  const src = ler("src/hooks/useSosController.ts");
  assert.ok(!src.includes("mark_sos_notification_delivered"), "o cliente não pode marcar entrega");
});

/* ================================================================== *
 * CHECKPOINT 1B
 * ================================================================== */

test("1B — o script de teste roda com strip-types e cobre as cinco suítes", () => {
  const pkg = JSON.parse(ler("package.json")) as { scripts: Record<string, string> };
  const script = pkg.scripts.test;
  assert.ok(script.includes("--experimental-strip-types"), "falta a flag de strip-types");
  assert.ok(script.includes("--test"), "falta o runner do node");
  for (const arquivo of [
    "src/lib/phone.test.ts",
    "src/lib/coords.test.ts",
    "src/lib/sos.server.test.ts",
    "src/lib/sos-client.test.ts",
    "src/lib/sos-unificacao.test.ts",
  ]) {
    assert.ok(script.includes(arquivo), `o script não roda ${arquivo}`);
  }
});

test("1B — authenticated perde INSERT, UPDATE e DELETE em sos_events", () => {
  const sql = sqlNovo();
  assert.ok(
    /REVOKE INSERT, UPDATE, DELETE ON public\.sos_events FROM authenticated/i.test(sql),
    "faltou revogar os GRANTs de escrita de authenticated",
  );
  for (const policy of ["sos_insert_own", "sos_update_own", "sos_delete_own"]) {
    assert.ok(
      new RegExp(`DROP POLICY IF EXISTS "${policy}" ON public\\.sos_events`, "i").test(sql),
      `a policy ${policy} continua de pé`,
    );
  }
  assert.ok(
    /GRANT SELECT ON public\.sos_events TO authenticated/i.test(sql),
    "a leitura dos próprios eventos precisa continuar",
  );
});

test("1B — o service_role não foi bloqueado", () => {
  const sql = sqlNovo();
  assert.ok(
    /GRANT ALL ON public\.sos_events TO service_role/i.test(sql),
    "o servidor precisa manter acesso total",
  );
  assert.ok(
    !/REVOKE[^;]*FROM service_role/i.test(sql),
    "nenhuma revogação pode atingir o service_role",
  );
});

test("1B — o cliente não escreve mais em sos_events em lugar nenhum", () => {
  const arquivosCliente = [
    "src/hooks/useSosController.ts",
    "src/hooks/useHistory.ts",
    ...ACIONADORES,
  ];
  for (const arquivo of arquivosCliente) {
    const src = semComentarios(ler(arquivo));
    for (const dml of [".insert(", ".update(", ".delete(", ".upsert("]) {
      const trecho = src.match(new RegExp(`from\\("sos_events"\\)[\\s\\S]{0,120}`, "g")) ?? [];
      for (const t of trecho) {
        assert.ok(!t.includes(dml), `${arquivo} ainda faz ${dml} em sos_events`);
      }
    }
  }
});

test("1B — apagar o histórico passa por RPC, não por DELETE direto", () => {
  const src = ler("src/hooks/useHistory.ts");
  assert.ok(src.includes('supabase.rpc("sos_purge_history")'), "o clear precisa usar a RPC");
  const sql = sqlNovo();
  assert.ok(/FUNCTION public\.sos_purge_history/i.test(sql), "falta a função de purga");
  assert.ok(
    /DELETE FROM public\.sos_events[\s\S]*?status <> 'active'/i.test(sql),
    "a purga não pode apagar um SOS ainda ativo",
  );
});

test("1B — sos_open valida accuracy_m e fix_age_ms no próprio SQL", () => {
  const sql = sqlNovo();
  assert.ok(
    /_accuracy_m IS NOT NULL AND NOT \(_accuracy_m BETWEEN 0 AND 500\)/i.test(sql),
    "falta a validação de accuracy_m entre 0 e 500",
  );
  assert.ok(
    /_fix_age_ms IS NOT NULL AND NOT \(_fix_age_ms BETWEEN 0 AND 60000\)/i.test(sql),
    "falta a validação de fix_age_ms entre 0 e 60000",
  );
});

test("1B — sos_open valida coordenada, 0,0, note e request_id no SQL", () => {
  const sql = sqlNovo();
  assert.ok(/_lat BETWEEN -90 AND 90/i.test(sql), "falta a faixa de latitude");
  assert.ok(/_lng BETWEEN -180 AND 180/i.test(sql), "falta a faixa de longitude");
  assert.ok(/_lat = 0 AND _lng = 0/i.test(sql), "falta a rejeição de 0,0");
  assert.ok(/length\(_note\) > 500/i.test(sql), "falta o limite de 500 caracteres da note");
  assert.ok(/_request_id IS NULL/i.test(sql), "falta exigir request_id");
});

test("1B — a abertura é serializada por usuário antes de procurar ou inserir", () => {
  const sql = sqlNovo();
  const posLock = sql.search(/pg_advisory_xact_lock/i);
  assert.ok(posLock > 0, "falta o advisory lock por usuário");
  assert.ok(
    /pg_advisory_xact_lock\(hashtextextended\(v_uid::text/i.test(sql),
    "o lock precisa ser derivado do auth.uid()",
  );
  // O lock tem que vir ANTES da busca pelo request_id e do INSERT, senão duas
  // chamadas simultâneas ainda passariam as duas pela verificação.
  const corpo = sql.slice(posLock);
  assert.ok(
    corpo.includes("WHERE request_id = _request_id AND user_id = v_uid"),
    "a busca pelo request_id precisa acontecer depois do lock",
  );
  assert.ok(
    corpo.includes("INSERT INTO public.sos_events"),
    "o INSERT precisa acontecer depois do lock",
  );
});

test("1B — colisão de índice único é tratada, não devolvida ao aparelho", () => {
  const sql = sqlNovo();
  assert.ok(
    /EXCEPTION\s*\n\s*WHEN unique_violation THEN/i.test(sql),
    "falta o tratamento explícito de unique_violation",
  );
  const trecho = sql.slice(sql.search(/WHEN unique_violation THEN/i));
  assert.ok(
    /v_reused := true/i.test(trecho.slice(0, 400)),
    "quem perde a corrida precisa receber reused = true",
  );
  assert.ok(
    /status = 'active'/i.test(trecho.slice(0, 600)),
    "quem perde a corrida precisa reler o evento vencedor",
  );
});

test("1B — request_id de evento encerrado não ressuscita o alerta", () => {
  const sql = sqlNovo();
  assert.ok(
    /IF v_event\.status <> 'active' THEN[\s\S]{0,300}?SOS_ENCERRADO/i.test(sql),
    "o SQL precisa recusar request_id de evento já encerrado",
  );
  const hook = ler("src/hooks/useSosController.ts");
  assert.ok(hook.includes("isActiveSosStatus(res.status)"), "o hook precisa validar o status");
  const posValidacao = hook.indexOf("isActiveSosStatus(res.status)");
  const posSnapshot = hook.indexOf("saveActiveSos({", posValidacao - 2000);
  assert.ok(
    posValidacao < hook.indexOf("saveActiveSos({", posValidacao),
    "a validação precisa vir antes de salvar o snapshot",
  );
  assert.ok(posSnapshot !== -1, "o snapshot continua existindo para o caminho válido");
  assert.ok(
    hook.includes("isEventoEncerradoError"),
    "o hook precisa reconhecer o erro e descartar o request_id velho",
  );
});

test("1B — TriggerSosResult carrega o status do evento", () => {
  const src = ler("src/lib/sos.functions.ts");
  const bloco = src.slice(src.indexOf("export interface TriggerSosResult"));
  assert.ok(/status:\s*string;/.test(bloco.slice(0, 600)), "falta status no TriggerSosResult");
  assert.ok(src.includes("status: row.status"), "o servidor precisa devolver o status do banco");
});

test("1B — o WhatsApp nunca abre sozinho", () => {
  const hook = ler("src/hooks/useSosController.ts");
  assert.ok(!hook.includes("autoOpenedRef"), "autoOpenedRef precisa sumir por completo");
  assert.ok(!hook.includes("window.open"), "o hook não pode abrir o WhatsApp sozinho");
  for (const arquivo of [...ACIONADORES, "src/components/SosPanel.tsx"]) {
    const src = semComentarios(ler(arquivo));
    assert.ok(!src.includes("window.open"), `${arquivo} abre o WhatsApp sem toque do usuário`);
  }
  // O único caminho para o WhatsApp é um <a href> que exige toque.
  const painel = ler("src/components/SosPanel.tsx");
  assert.ok(painel.includes("href={r.href}"), "o envio manual precisa ser um link tocável");
});

test("1B — o painel não renderiza todo destinatário como link", () => {
  const painel = ler("src/components/SosPanel.tsx");
  assert.ok(painel.includes("allowsManualSend"), "o painel precisa consultar a regra do botão");
  assert.ok(
    /if \(!manual\) \{/.test(painel),
    "precisa existir um caminho de renderização SEM link",
  );
  const posRegra = painel.indexOf("allowsManualSend(r.state)");
  const posLink = painel.indexOf("href={r.href}");
  assert.ok(posRegra > 0 && posLink > posRegra, "a regra precisa ser avaliada antes do link");
});

test("1B — os acionadores ficam bloqueados durante a recuperação", () => {
  for (const arquivo of [
    "src/components/SosFab.tsx",
    "src/components/MapSosButton.tsx",
    "src/routes/_authenticated/sos.tsx",
  ]) {
    const src = ler(arquivo);
    assert.ok(
      src.includes("sos.busy || sos.recovering"),
      `${arquivo} permite acionar antes da recuperação terminar`,
    );
  }
  // Trava também na lógica, não só no atributo disabled.
  const hook = ler("src/hooks/useSosController.ts");
  const trigger = hook.slice(hook.indexOf("const trigger = useCallback("));
  assert.ok(
    /if \(recovering\) \{/.test(trigger.slice(0, 800)),
    "o trigger precisa recusar acionamento enquanto recovering for true",
  );
});

test("1B — recovering nunca fica preso em true", () => {
  const hook = ler("src/hooks/useSosController.ts");
  assert.ok(
    /\} finally \{\s*\n\s*if \(!cancelado && mountedRef\.current\) setRecovering\(false\);/.test(
      hook,
    ),
    "a recuperação precisa liberar o botão mesmo se a consulta falhar",
  );
});

test("1B — as migrations do 1B também são aditivas", () => {
  const todas = arquivosSql();
  const antigas = todas.filter((f) => !ehCheckpoint(f, "qualquer"));
  assert.equal(antigas.length, 23, "o número de migrations pré-existentes mudou");
  const doCheckpoint1 = todas.filter((f) => ehCheckpoint(f, "1"));
  const doCheckpoint1b = todas.filter((f) => ehCheckpoint(f, "1B"));
  assert.equal(doCheckpoint1.length, 2, "as migrations do checkpoint 1 mudaram de número");
  assert.equal(doCheckpoint1b.length, 2, "esperadas exatamente 2 migrations no checkpoint 1B");
});
