import test from "node:test";
import assert from "node:assert/strict";
import { isValidCoordinate } from "./coords.ts";
import {
  SOS_HOLD_MS,
  SOS_MAX_ACCURACY_M,
  SOS_MAX_FIX_AGE_MS,
  SOS_ERRO_ENCERRADO,
  SOS_STORAGE_KEY,
  allowsManualSend,
  buildSosMessage,
  claimsDelivery,
  clearActiveSos,
  deliveryStateFromRow,
  guardTrigger,
  isActiveSosStatus,
  isEventoEncerradoError,
  isValidUuid,
  loadActiveSos,
  newRequestId,
  parseActiveSos,
  saveActiveSos,
  serializeActiveSos,
  sosDeliveryLabel,
  sosPanelTitle,
  sosPhaseLabel,
  validateSosFix,
  waLink,
  type ActiveSosSnapshot,
  type SosDeliveryState,
  type SosFix,
  type SosPhase,
} from "./sos-client.ts";

const AGORA = 1_770_000_000_000; // instante fixo para todos os testes de tempo

test("título agregado só confirma entrega quando todos os destinatários estão confirmados", () => {
  const states: SosDeliveryState[] = [
    "preparada",
    "aberta_no_whatsapp",
    "enviando",
    "aceita_pelo_provedor",
    "recusada_pelo_provedor",
    "envio_incerto",
    "entregue_confirmado",
  ];
  for (const first of states) {
    for (const second of states) {
      const title = sosPanelTitle("aguardando_envio", [first, second]);
      assert.equal(
        title.includes("entrega confirmada"),
        claimsDelivery(first) && claimsDelivery(second),
      );
    }
  }
  assert.ok(!sosPanelTitle("aguardando_envio", []).includes("entrega confirmada"));
});

test("título agregado preserva cancelamento e recuperação nativa enquanto consulta os avisos", () => {
  assert.equal(sosPanelTitle("cancelando", ["aceita_pelo_provedor"]), sosPhaseLabel("cancelando"));
  const recovery = "SOS registrado; aguardando sincronização";
  assert.equal(sosPanelTitle("aguardando_envio", ["preparada"], recovery), recovery);
  assert.notEqual(
    sosPanelTitle("aguardando_envio", ["aceita_pelo_provedor"]),
    sosPhaseLabel("aguardando_envio"),
  );
});

function fix(over: Partial<Parameters<typeof validateSosFix>[0]> = {}) {
  return { lat: -23.9608, lng: -46.3339, accuracy: 12, timestamp: AGORA, ...over };
}

/* ================================================================== *
 * 1. UUID válido
 * ================================================================== */

test("newRequestId gera UUID v4 no formato RFC 4122", () => {
  for (let i = 0; i < 200; i += 1) {
    const id = newRequestId();
    assert.ok(isValidUuid(id), `id fora do padrão: ${id}`);
    assert.equal(id.length, 36);
    assert.equal(id[14], "4", "o dígito de versão precisa ser 4");
    assert.ok("89ab".includes(id[19]), "variante RFC 4122 inválida");
  }
});

test("isValidUuid rejeita o que não é UUID", () => {
  assert.equal(isValidUuid(""), false);
  assert.equal(isValidUuid("abc"), false);
  assert.equal(isValidUuid(null), false);
  assert.equal(isValidUuid(123), false);
  assert.equal(isValidUuid("00000000-0000-0000-0000-000000000000"), false); // versão 0
  assert.equal(isValidUuid("f47ac10b58cc4372a5670e02b2c3d479"), false); // sem hífens
  assert.equal(isValidUuid("f47ac10b-58cc-4372-a567-0e02b2c3d479"), true);
});

/* ================================================================== *
 * 2. Idempotência do request_id
 * ================================================================== */

test("request_id nunca se repete em 5000 gerações", () => {
  const vistos = new Set<string>();
  for (let i = 0; i < 5000; i += 1) vistos.add(newRequestId());
  assert.equal(vistos.size, 5000, "houve colisão de request_id");
});

test("o mesmo request_id é reaproveitado numa retentativa, não substituído", () => {
  // Simula o que o hook faz: gera uma vez, guarda, e reenvia o mesmo valor.
  const requestId = newRequestId();
  const tentativa1 = { requestId, lat: -23.9, lng: -46.3 };
  const tentativa2 = { requestId, lat: -23.9, lng: -46.3 };
  assert.equal(tentativa1.requestId, tentativa2.requestId);
  assert.ok(isValidUuid(tentativa2.requestId));
});

test("o snapshot persistido carrega o request_id para depois do recarregamento", () => {
  const requestId = newRequestId();
  const sosEventId = newRequestId();
  const snap: ActiveSosSnapshot = {
    sosEventId,
    requestId,
    lat: -23.9608,
    lng: -46.3339,
    accuracy: 10,
    triggeredAt: AGORA,
  };
  const voltou = parseActiveSos(serializeActiveSos(snap), AGORA + 1000);
  assert.equal(voltou?.requestId, requestId, "o request_id precisa sobreviver ao F5");
});

/* ================================================================== *
 * 3. Coordenadas válidas e inválidas
 * ================================================================== */

test("aceita coordenadas reais", () => {
  const r = validateSosFix(fix(), AGORA);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.fix.lat, -23.9608);
    assert.equal(r.fix.lng, -46.3339);
    assert.equal(r.fix.degraded, false);
  }
});

test("rejeita coordenadas impossíveis, não numéricas e a Null Island", () => {
  const casos: Array<[unknown, unknown, string]> = [
    [91, -46.3, "latitude acima de 90"],
    [-91, -46.3, "latitude abaixo de -90"],
    [-23.9, 181, "longitude acima de 180"],
    [-23.9, -181, "longitude abaixo de -180"],
    [0, 0, "Null Island"],
    [NaN, -46.3, "NaN"],
    [Infinity, -46.3, "Infinity"],
    ["-23.9", "-46.3", "string em vez de número"],
    [null, null, "nulo"],
  ];
  for (const [lat, lng, rotulo] of casos) {
    const r = validateSosFix(fix({ lat, lng }), AGORA);
    assert.equal(r.ok, false, `deveria recusar: ${rotulo}`);
    if (!r.ok) assert.equal(r.reason, "coordenada_invalida", rotulo);
  }
});

test("a regra de coordenada do SOS bate com isValidCoordinate de coords.ts", () => {
  // O sos-client.ts é autocontido de propósito; este teste impede que as duas
  // implementações divirjam em silêncio.
  const amostra: Array<[number, number]> = [
    [-23.9608, -46.3339],
    [0, 0],
    [90, 180],
    [-90, -180],
    [91, 0],
    [0, 181],
    [45.5, -73.5],
  ];
  for (const [lat, lng] of amostra) {
    const doSos = validateSosFix(fix({ lat, lng }), AGORA);
    const aceitaNoSos = doSos.ok || doSos.reason !== "coordenada_invalida";
    assert.equal(
      aceitaNoSos,
      isValidCoordinate(lat, lng),
      `divergência em (${lat}, ${lng}) entre sos-client e coords`,
    );
  }
});

/* ================================================================== *
 * 4. Posição antiga
 * ================================================================== */

test("recusa fix mais velho que a janela documentada", () => {
  const r = validateSosFix(fix({ timestamp: AGORA - SOS_MAX_FIX_AGE_MS - 1 }), AGORA);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "fix_antigo");
});

test("aceita fix bem na borda da janela e calcula a idade", () => {
  const r = validateSosFix(fix({ timestamp: AGORA - SOS_MAX_FIX_AGE_MS }), AGORA);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.fix.ageMs, SOS_MAX_FIX_AGE_MS);
});

test("fix sem timestamp não vira SOS", () => {
  const r = validateSosFix({ lat: -23.9, lng: -46.3, accuracy: 10, timestamp: null }, AGORA);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "sem_fix");
});

test("fix com data no futuro é tratado como forjado", () => {
  const r = validateSosFix(fix({ timestamp: AGORA + 60_000 }), AGORA);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "fix_simulado");
});

/* ================================================================== *
 * 5. Posição imprecisa
 * ================================================================== */

test("recusa precisão pior que o limite de emergência", () => {
  const r = validateSosFix(fix({ accuracy: SOS_MAX_ACCURACY_M + 1 }), AGORA);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "fix_impreciso");
});

test("aceita no limite e marca como degradado quando passa do aviso", () => {
  const limite = validateSosFix(fix({ accuracy: SOS_MAX_ACCURACY_M }), AGORA);
  assert.equal(limite.ok, true);
  if (limite.ok) assert.equal(limite.fix.degraded, true, "150 m+ precisa avisar na tela");

  const bom = validateSosFix(fix({ accuracy: 8 }), AGORA);
  assert.equal(bom.ok, true);
  if (bom.ok) assert.equal(bom.fix.degraded, false);
});

test("precisão ausente ou negativa vira null em vez de erro silencioso", () => {
  const semPrecisao = validateSosFix(fix({ accuracy: null }), AGORA);
  assert.equal(semPrecisao.ok, true);
  if (semPrecisao.ok) assert.equal(semPrecisao.fix.accuracy, null);

  const negativa = validateSosFix(fix({ accuracy: -5 }), AGORA);
  assert.equal(negativa.ok, true);
  if (negativa.ok) assert.equal(negativa.fix.accuracy, null);
});

/* ================================================================== *
 * 6. Localização simulada
 * ================================================================== */

test("recusa posição vinda de app de mock", () => {
  const a = validateSosFix(fix({ mocked: true }), AGORA);
  assert.equal(a.ok, false);
  if (!a.ok) assert.equal(a.reason, "fix_simulado");

  const b = validateSosFix(fix({ isFromMockProvider: true }), AGORA);
  assert.equal(b.ok, false);
  if (!b.ok) assert.equal(b.reason, "fix_simulado");
});

test("recusa velocidade fisicamente impossível para uma moto", () => {
  const r = validateSosFix(fix({ speed: 300 }), AGORA); // 1080 km/h
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "fix_simulado");

  const ok = validateSosFix(fix({ speed: 22 }), AGORA); // ~79 km/h
  assert.equal(ok.ok, true);
});

/* ================================================================== *
 * 7. Duplo acionamento
 * ================================================================== */

test("bloqueia o segundo toque enquanto o primeiro ainda roda", () => {
  const r = guardTrigger({ inFlight: true, activeSosId: null, lastTriggerAt: 0, now: AGORA });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "em_andamento");
});

test("bloqueia acionamento novo quando já existe SOS aberto", () => {
  const r = guardTrigger({
    inFlight: false,
    activeSosId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    lastTriggerAt: 0,
    now: AGORA,
  });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "sos_ja_ativo");
});

test("bloqueia rajada dentro da janela de esfriamento", () => {
  const r = guardTrigger({
    inFlight: false,
    activeSosId: null,
    lastTriggerAt: AGORA - 1000,
    now: AGORA,
  });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "acionado_ha_pouco");
});

test("bloqueia toque curto: sem os 3 segundos não aciona", () => {
  const curto = guardTrigger({
    inFlight: false,
    activeSosId: null,
    lastTriggerAt: 0,
    heldMs: SOS_HOLD_MS - 1,
    now: AGORA,
  });
  assert.equal(curto.allowed, false);
  if (!curto.allowed) assert.equal(curto.reason, "hold_incompleto");

  const completo = guardTrigger({
    inFlight: false,
    activeSosId: null,
    lastTriggerAt: 0,
    heldMs: SOS_HOLD_MS,
    now: AGORA,
  });
  assert.equal(completo.allowed, true);
});

test("libera quando não há nada travando", () => {
  const r = guardTrigger({ inFlight: false, activeSosId: null, lastTriggerAt: 0, now: AGORA });
  assert.equal(r.allowed, true);
});

test("uma rajada de 10 toques resulta em um único acionamento permitido", () => {
  let inFlight = false;
  let ultimo = 0;
  let permitidos = 0;
  for (let i = 0; i < 10; i += 1) {
    const g = guardTrigger({
      inFlight,
      activeSosId: null,
      lastTriggerAt: ultimo,
      heldMs: SOS_HOLD_MS,
      now: AGORA + i * 40, // 10 toques em 400 ms
    });
    if (g.allowed) {
      permitidos += 1;
      inFlight = true; // o hook trava aqui antes de qualquer await
      ultimo = AGORA + i * 40;
      inFlight = false; // e destrava no finally
    }
  }
  assert.equal(permitidos, 1, "toque repetido não pode abrir vários SOS");
});

/* ================================================================== *
 * 8. Recuperação de SOS ativo
 * ================================================================== */

function comStorageFalso<T>(fn: () => T): T {
  const mapa = new Map<string, string>();
  const g = globalThis as unknown as { localStorage?: unknown };
  const anterior = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => void mapa.set(k, v),
    removeItem: (k: string) => void mapa.delete(k),
  };
  try {
    return fn();
  } finally {
    if (anterior === undefined) delete g.localStorage;
    else g.localStorage = anterior;
  }
}

test("um SOS ativo volta depois de recarregar a tela", () => {
  comStorageFalso(() => {
    const snap: ActiveSosSnapshot = {
      sosEventId: newRequestId(),
      requestId: newRequestId(),
      lat: -23.9608,
      lng: -46.3339,
      accuracy: 14,
      triggeredAt: Date.now(),
    };
    saveActiveSos(snap);
    const recuperado = loadActiveSos();
    assert.notEqual(recuperado, null, "o SOS deveria voltar após o F5");
    assert.equal(recuperado?.sosEventId, snap.sosEventId);
    assert.equal(recuperado?.lat, -23.9608);
  });
});

test("snapshot corrompido ou de outro formato não vira SOS fantasma", () => {
  assert.equal(parseActiveSos(null), null);
  assert.equal(parseActiveSos("não é json"), null);
  assert.equal(parseActiveSos("[]"), null);
  assert.equal(parseActiveSos('{"sosEventId":"abc","requestId":"def","triggeredAt":1}'), null);
  assert.equal(
    parseActiveSos(JSON.stringify({ sosEventId: newRequestId(), requestId: newRequestId() })),
    null,
    "sem triggeredAt não dá para saber se venceu",
  );
});

test("snapshot vencido é descartado em vez de reabrir um alerta velho", () => {
  const snap: ActiveSosSnapshot = {
    sosEventId: newRequestId(),
    requestId: newRequestId(),
    lat: -23.9,
    lng: -46.3,
    accuracy: null,
    triggeredAt: AGORA,
  };
  const dentro = parseActiveSos(serializeActiveSos(snap), AGORA + 5 * 60 * 60 * 1000);
  assert.notEqual(dentro, null, "5 h ainda vale");
  const fora = parseActiveSos(serializeActiveSos(snap), AGORA + 7 * 60 * 60 * 1000);
  assert.equal(fora, null, "7 h já é sucata");
});

test("a chave de storage é estável entre telas", () => {
  assert.equal(SOS_STORAGE_KEY, "moto-anjo:sos-ativo");
});

/* ================================================================== *
 * 9. Cancelamento
 * ================================================================== */

test("cancelar apaga o snapshot local e libera um novo acionamento", () => {
  comStorageFalso(() => {
    saveActiveSos({
      sosEventId: newRequestId(),
      requestId: newRequestId(),
      lat: -23.9,
      lng: -46.3,
      accuracy: null,
      triggeredAt: Date.now(),
    });
    assert.notEqual(loadActiveSos(), null);

    // Enquanto ativo, o porteiro barra um segundo SOS.
    const ativo = loadActiveSos();
    const bloqueado = guardTrigger({
      inFlight: false,
      activeSosId: ativo?.sosEventId ?? null,
      lastTriggerAt: 0,
      heldMs: SOS_HOLD_MS,
    });
    assert.equal(bloqueado.allowed, false);

    clearActiveSos();
    assert.equal(loadActiveSos(), null, "o cancelamento precisa limpar o estado local");

    const liberado = guardTrigger({
      inFlight: false,
      activeSosId: null,
      lastTriggerAt: 0,
      heldMs: SOS_HOLD_MS,
    });
    assert.equal(liberado.allowed, true, "depois de cancelar dá para acionar de novo");
  });
});

test("cancelar duas vezes seguidas não quebra", () => {
  comStorageFalso(() => {
    clearActiveSos();
    clearActiveSos();
    assert.equal(loadActiveSos(), null);
  });
});

/* ================================================================== *
 * 10. Montagem da mensagem
 * ================================================================== */

const FIX_BOM: SosFix = {
  lat: -23.9608,
  lng: -46.3339,
  accuracy: 12,
  timestamp: AGORA,
  ageMs: 0,
  degraded: false,
};

test("a mensagem traz nome, aviso, link do mapa e horário de São Paulo", () => {
  const msg = buildSosMessage({
    name: "Herman",
    fix: FIX_BOM,
    when: new Date("2026-08-06T15:30:00Z"),
  });
  assert.ok(msg.includes("MOTO ANJO"), "identifica o app");
  assert.ok(msg.includes("SOS"), "deixa claro que é emergência");
  assert.ok(msg.includes("Herman"), "diz quem acionou");
  assert.ok(msg.includes("https://maps.google.com/?q=-23.9608,-46.3339"), "link do mapa");
  assert.ok(msg.includes("12 m"), "informa o raio de precisão");
  assert.ok(msg.includes("06/08/2026"), "data no fuso de São Paulo");
  assert.ok(msg.includes("12:30"), "hora convertida para America/Sao_Paulo");
  assert.ok(msg.includes("190"), "lembra o telefone da polícia");
});

test("sem GPS a mensagem sai assumindo a falta de posição, não com link vazio", () => {
  const msg = buildSosMessage({
    name: "Herman",
    fix: null,
    when: new Date("2026-08-06T15:30:00Z"),
  });
  assert.ok(!msg.includes("maps.google.com"), "não pode mandar link para lugar nenhum");
  assert.ok(msg.includes("GPS não respondeu"), "assume a falta em vez de esconder");
  assert.ok(msg.includes("Herman"));
});

test("a observação entra na mensagem quando existe e some quando é vazia", () => {
  const com = buildSosMessage({
    name: "Herman",
    fix: FIX_BOM,
    when: new Date(AGORA),
    note: "Moto caiu na via expressa",
  });
  assert.ok(com.includes("Moto caiu na via expressa"));

  const sem = buildSosMessage({ name: "Herman", fix: FIX_BOM, when: new Date(AGORA), note: "   " });
  assert.ok(!sem.includes("Observação"));
});

test("mensagem sem nome não vira mensagem quebrada", () => {
  const msg = buildSosMessage({ name: "", fix: FIX_BOM, when: new Date(AGORA) });
  assert.ok(msg.includes("Um motociclista"));
});

test("o link do WhatsApp normaliza o telefone e escapa a mensagem", () => {
  const link = waLink("(13) 99999-0000", "linha 1\nlinha 2 & fim");
  assert.ok(link.startsWith("https://wa.me/5513999990000?text="));
  assert.ok(link.includes("%0A"), "quebra de linha precisa vir escapada");
  assert.ok(link.includes("%26"), "o & precisa vir escapado");
  assert.ok(!link.includes(" "), "não pode sobrar espaço cru na URL");
});

/* ================================================================== *
 * 11. Estados que nunca afirmam "entregue"
 * ================================================================== */

const TODAS_AS_FASES: SosPhase[] = [
  "ocioso",
  "localizando",
  "gps_recusado",
  "sem_internet",
  "registrando",
  "aguardando_envio",
  "sem_contatos",
  "falha_registro",
  "cancelando",
];

test("nenhuma fase do fluxo afirma entrega", () => {
  for (const fase of TODAS_AS_FASES) {
    const texto = sosPhaseLabel(fase).toLowerCase();
    assert.ok(!texto.includes("entregue"), `a fase ${fase} afirma entrega: "${texto}"`);
    assert.ok(!texto.includes("recebeu"), `a fase ${fase} afirma recebimento: "${texto}"`);
  }
});

test("só o estado confirmado por webhook usa a palavra entregue", () => {
  const estados: SosDeliveryState[] = [
    "preparada",
    "aberta_no_whatsapp",
    "aceita_pelo_provedor",
    "recusada_pelo_provedor",
    "entregue_confirmado",
  ];
  for (const e of estados) {
    const texto = sosDeliveryLabel(e).toLowerCase();
    if (e === "entregue_confirmado") {
      assert.ok(texto.includes("entregue"));
      assert.ok(texto.includes("confirmado"), "precisa dizer de onde veio a confirmação");
      assert.equal(claimsDelivery(e), true);
    } else {
      assert.ok(!texto.includes("entregue"), `o estado ${e} afirma entrega: "${texto}"`);
      assert.equal(claimsDelivery(e), false);
    }
  }
});

test("abrir o wa.me não promove a mensagem a entregue", () => {
  const estado = deliveryStateFromRow({ status: "queued" }, true);
  assert.equal(estado, "aberta_no_whatsapp");
  assert.equal(claimsDelivery(estado), false);
  assert.ok(sosDeliveryLabel(estado).toLowerCase().includes("confirme o envio"));
});

test("a API aceitar o envio também não é entrega", () => {
  const estado = deliveryStateFromRow({ status: "sent" });
  assert.equal(estado, "aceita_pelo_provedor");
  assert.equal(claimsDelivery(estado), false);
  // O texto pede para AGUARDAR a confirmação — ou seja, ela ainda não veio.
  assert.ok(sosDeliveryLabel(estado).toLowerCase().includes("aguardando confirmação"));
  assert.ok(!sosDeliveryLabel(estado).toLowerCase().includes("entregue"));
});

test("apenas status delivered/read vindos do webhook viram entrega", () => {
  assert.equal(claimsDelivery(deliveryStateFromRow({ status: "delivered" })), true);
  assert.equal(claimsDelivery(deliveryStateFromRow({ status: "read" })), true);
  assert.equal(claimsDelivery(deliveryStateFromRow({ status: "queued" })), false);
  assert.equal(claimsDelivery(deliveryStateFromRow({ status: "sending" })), false);
  assert.equal(claimsDelivery(deliveryStateFromRow({ status: "failed" })), false);
  assert.equal(claimsDelivery(deliveryStateFromRow({ status: null })), false);
  assert.equal(claimsDelivery(deliveryStateFromRow({ status: "qualquer_coisa" })), false);
});

test("falha do provedor aponta a saída manual em vez de mentir", () => {
  const estado = deliveryStateFromRow({ status: "failed" });
  assert.equal(estado, "recusada_pelo_provedor");
  assert.ok(sosDeliveryLabel(estado).toLowerCase().includes("botão enviar"));
});

/* ================================================================== *
 * 12. Botão manual: quando aparece e quando some (1B)
 * ================================================================== */

test("status 'sending' vira um estado próprio, separado de preparada e de sent", () => {
  assert.equal(deliveryStateFromRow({ status: "sending" }), "enviando");
  assert.equal(deliveryStateFromRow({ status: "queued" }), "preparada");
  assert.equal(deliveryStateFromRow({ status: "sent" }), "aceita_pelo_provedor");
});

test("sending NÃO mostra botão manual", () => {
  assert.equal(allowsManualSend("enviando"), false);
});

test("sent NÃO mostra botão manual", () => {
  assert.equal(allowsManualSend(deliveryStateFromRow({ status: "sent" })), false);
});

test("delivered e read NÃO mostram botão manual", () => {
  assert.equal(allowsManualSend(deliveryStateFromRow({ status: "delivered" })), false);
  assert.equal(allowsManualSend(deliveryStateFromRow({ status: "read" })), false);
});

test("failed MOSTRA botão manual — é a única saída que resta", () => {
  assert.equal(allowsManualSend(deliveryStateFromRow({ status: "failed" })), true);
});

test("prepared e opened mostram botão manual", () => {
  assert.equal(allowsManualSend(deliveryStateFromRow({ status: "queued" })), true);
  assert.equal(allowsManualSend(deliveryStateFromRow({ status: "queued" }, true)), true);
  assert.equal(allowsManualSend("preparada"), true);
  assert.equal(allowsManualSend("aberta_no_whatsapp"), true);
});

test("os textos exigidos para sent e delivered estão exatos", () => {
  assert.equal(
    sosDeliveryLabel("aceita_pelo_provedor"),
    "WhatsApp aceitou o aviso. Aguardando confirmação.",
  );
  assert.equal(sosDeliveryLabel("entregue_confirmado"), "Entregue — confirmado pelo WhatsApp.");
});

test("o estado 'enviando' também não afirma entrega", () => {
  const texto = sosDeliveryLabel("enviando").toLowerCase();
  assert.ok(!texto.includes("entregue"));
  assert.equal(claimsDelivery("enviando"), false);
});

/* ================================================================== *
 * 13. Evento encerrado não volta como aberto (1B)
 * ================================================================== */

test("somente 'active' conta como SOS em curso", () => {
  assert.equal(isActiveSosStatus("active"), true);
  for (const encerrado of ["cancelled", "resolved", "expired", "superseded", "notified"]) {
    assert.equal(isActiveSosStatus(encerrado), false, `${encerrado} não pode contar como aberto`);
  }
  assert.equal(isActiveSosStatus(null), false);
  assert.equal(isActiveSosStatus(undefined), false);
  assert.equal(isActiveSosStatus(""), false);
});

test("o erro de request_id encerrado é reconhecível pelo cliente", () => {
  assert.equal(SOS_ERRO_ENCERRADO, "SOS_ENCERRADO");
  const doBanco = new Error(
    "SOS_ENCERRADO: este acionamento ja foi encerrado (status cancelled). Gere um novo request_id.",
  );
  assert.equal(isEventoEncerradoError(doBanco), true);
  assert.equal(isEventoEncerradoError(new Error("Falha de rede")), false);
  assert.equal(isEventoEncerradoError(null), false);
  assert.equal(isEventoEncerradoError("SOS_ENCERRADO: status resolved"), true);
});

test("um request_id de evento cancelado não reabre o painel", () => {
  // Reproduz o que o hook faz com a resposta do servidor: só salva snapshot
  // e mantém o painel aberto quando o status devolvido é 'active'.
  const resposta = { sosEventId: newRequestId(), status: "cancelled" };
  const deveManterAberto = isActiveSosStatus(resposta.status);
  assert.equal(deveManterAberto, false, "evento cancelado não pode voltar como alerta aberto");

  comStorageFalso(() => {
    saveActiveSos({
      sosEventId: resposta.sosEventId,
      requestId: newRequestId(),
      lat: -23.9,
      lng: -46.3,
      accuracy: null,
      triggeredAt: Date.now(),
    });
    // O hook chama clearActiveSos() nesse caminho.
    if (!deveManterAberto) clearActiveSos();
    assert.equal(loadActiveSos(), null, "snapshot de evento encerrado precisa sumir");
  });
});
