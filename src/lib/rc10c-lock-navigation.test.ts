import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHAVE_LOCK_NAV,
  LOCK_NAV_PADRAO,
  MAX_PONTOS_TRACADO,
  QUADRO_VAZIO,
  definirPreferenciaTelaBloqueada,
  montarQuadroBloqueado,
  preferenciaTelaBloqueada,
  quadrosIguais,
  reduzirTracado,
  textoPublico,
} from "./lock-navigation.ts";

/**
 * P0.1c — Navegação sobre a tela de bloqueio.
 *
 * Cada teste guarda uma regra que, se cair, vira defeito visível no aparelho:
 *   . mostrar navegação sem viagem ativa (tela mentindo depois do fim);
 *   . vazar e-mail/telefone no keyguard;
 *   . truque de full-screen intent ou overlay em vez da API oficial;
 *   . segundo GPS, segundo mapa, segundo SOS.
 */

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const semComentariosJava = (p: string) =>
  ler(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const semComentariosXml = (p: string) => ler(p).replace(/<!--[\s\S]*?-->/g, " ");

const JAVA = "android/app/src/main/java/com/motoanjo/app";

/* ================================================================== *
 * 1. Preferência de privacidade
 * ================================================================== */

function memoria(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    getItem: (k: string) => (k in dados ? dados[k] : null),
    setItem: (k: string, v: string) => {
      dados[k] = v;
    },
    dados,
  };
}

test("LOCK.1: o padrão é deliberado e documentado", () => {
  assert.equal(LOCK_NAV_PADRAO, true, "mudar o padrão exige atualizar a documentação do módulo");
  const doc = ler("src/lib/lock-navigation.ts");
  assert.match(doc, /PADRÃO DELIBERADO/);
});

test("LOCK.2: sem armazenamento a preferência cai no padrão, nunca em erro", () => {
  assert.equal(preferenciaTelaBloqueada(null), LOCK_NAV_PADRAO);
});

test("LOCK.3: desligar persiste e é respeitado", () => {
  const store = memoria();
  definirPreferenciaTelaBloqueada(false, store);
  assert.equal(store.dados[CHAVE_LOCK_NAV], "0");
  assert.equal(preferenciaTelaBloqueada(store), false);
  definirPreferenciaTelaBloqueada(true, store);
  assert.equal(preferenciaTelaBloqueada(store), true);
});

/* ================================================================== *
 * 2. Privacidade do quadro
 * ================================================================== */

test("LOCK.4: e-mail e telefone nunca chegam à tela de bloqueio", () => {
  assert.equal(textoPublico("Rua A, 10 — herman@exemplo.com"), "Rua A, 10 —");
  assert.equal(textoPublico("Contato +55 11 91234-5678"), "Contato");
  const q = montarQuadroBloqueado({
    viagemAtiva: true,
    permitida: true,
    destino: "Casa do João — joao@teste.com",
    manobra: "Vire à direita",
  });
  assert.ok(!q.destino.includes("@"));
});

test("LOCK.5: o quadro só carrega campos de navegação", () => {
  const chaves = Object.keys(QUADRO_VAZIO).sort();
  assert.deepEqual(chaves, [
    "ativa",
    "destino",
    "distanciaManobra",
    "eta",
    "lat",
    "lng",
    "manobra",
    "permitida",
    "restante",
    "risco",
    "rota",
  ]);
  for (const proibido of ["email", "telefone", "phone", "contato", "nome"]) {
    assert.ok(!chaves.includes(proibido), `${proibido} não pode existir no quadro`);
  }
});

/* ================================================================== *
 * 3. Gate: só com viagem ativa e permissão
 * ================================================================== */

test("LOCK.6: sem viagem ativa o quadro é vazio", () => {
  const q = montarQuadroBloqueado({
    viagemAtiva: false,
    permitida: true,
    manobra: "Vire à esquerda",
    posicao: { lat: -23.5, lng: -46.6 },
  });
  assert.equal(q.ativa, false);
  assert.equal(q.manobra, "");
  assert.equal(q.lat, 0);
});

test("LOCK.7: preferência desligada não publica navegação", () => {
  const q = montarQuadroBloqueado({
    viagemAtiva: true,
    permitida: false,
    manobra: "Siga 300 m",
  });
  assert.deepEqual(q, QUADRO_VAZIO);
});

test("LOCK.8: nada é inventado — sem rota, sem traçado e sem ETA", () => {
  const q = montarQuadroBloqueado({ viagemAtiva: true, permitida: true });
  assert.equal(q.ativa, true);
  assert.deepEqual(q.rota, []);
  assert.equal(q.eta, "");
  assert.equal(q.restante, "");
});

/* ================================================================== *
 * 4. Custo do traçado
 * ================================================================== */

test("LOCK.9: o traçado é reduzido, com início e fim preservados", () => {
  const pontos = Array.from({ length: 1000 }, (_, i) => ({ lat: i / 1000, lng: -i / 1000 }));
  const r = reduzirTracado(pontos);
  assert.equal(r.length, MAX_PONTOS_TRACADO * 2);
  assert.equal(r[0], pontos[0].lat);
  assert.equal(r[r.length - 1], pontos[pontos.length - 1].lng);
});

test("LOCK.10: pontos inválidos são descartados, não zerados", () => {
  const r = reduzirTracado([
    { lat: 1, lng: 2 },
    { lat: Number.NaN, lng: 3 } as { lat: number; lng: number },
    { lat: 4, lng: 5 },
  ]);
  assert.deepEqual(r, [1, 2, 4, 5]);
});

test("LOCK.11: quadros iguais não atravessam a ponte", () => {
  const base = {
    viagemAtiva: true,
    permitida: true,
    manobra: "Vire à direita",
    posicao: { lat: -23.5, lng: -46.6 },
    tracado: [
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ],
  };
  assert.equal(quadrosIguais(montarQuadroBloqueado(base), montarQuadroBloqueado(base)), true);
  assert.equal(
    quadrosIguais(
      montarQuadroBloqueado(base),
      montarQuadroBloqueado({ ...base, manobra: "Vire à esquerda" }),
    ),
    false,
  );
});

/* ================================================================== *
 * 5. Contrato Android
 * ================================================================== */

test("LOCK.12: a Activity usa a API oficial de tela bloqueada", () => {
  const a = semComentariosJava(`${JAVA}/LockNavigationActivity.java`);
  assert.match(a, /setShowWhenLocked\(true\)/);
  assert.match(a, /FLAG_SHOW_WHEN_LOCKED/, "abaixo da API 27 só existe a flag equivalente");
});

test("LOCK.13: nada de desbloqueio automático, overlay ou tela sempre acesa", () => {
  const a = semComentariosJava(`${JAVA}/LockNavigationActivity.java`);
  assert.ok(!/requestDismissKeyguard/.test(a), "não pedimos desbloqueio do aparelho");
  assert.ok(!/FLAG_KEEP_SCREEN_ON/.test(a), "a tela apaga normalmente; o serviço continua");
  assert.ok(!/setTurnScreenOn/.test(a), "não acordamos a tela sozinhos");
  const manifest = semComentariosXml("android/app/src/main/AndroidManifest.xml");
  assert.ok(!/SYSTEM_ALERT_WINDOW/.test(manifest), "overlay é gambiarra reprovada na Play");
  assert.ok(!/turnScreenOn/.test(manifest));
});

test("LOCK.14: nada de full-screen intent como truque de navegação", () => {
  const servico = semComentariosJava(`${JAVA}/ViagemSeguraService.java`);
  assert.ok(!/setFullScreenIntent/.test(servico), "full-screen intent é para chamada/alarme");
});

test("LOCK.15: a Activity está declarada e não é exportada", () => {
  const manifest = ler("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:name="\.LockNavigationActivity"/);
  const bloco = manifest.slice(manifest.indexOf(".LockNavigationActivity"));
  assert.match(bloco.slice(0, 500), /android:exported="false"/);
  assert.match(bloco.slice(0, 500), /android:showWhenLocked="true"/);
});

test("LOCK.16: a navegação de bloqueio existe só durante a viagem", () => {
  const servico = semComentariosJava(`${JAVA}/ViagemSeguraService.java`);
  // Abre quando a tela apaga (app ainda visível) e some ao desbloquear.
  assert.match(servico, /ACTION_SCREEN_OFF/);
  assert.match(servico, /ACTION_USER_PRESENT/);
  // Fim da viagem limpa o estado publicado.
  assert.match(servico, /LockNavigationState\.limpar\(\)/);
  assert.match(servico, /removerReceptorDeTela\(\)/);

  const activity = semComentariosJava(`${JAVA}/LockNavigationActivity.java`);
  // Recriação por process death não inventa viagem ativa.
  assert.match(activity, /if \(!inicial\.ativa \|\| !inicial\.permitida\)[\s\S]{0,300}finish\(\)/);
});

test("LOCK.17: um SOS só — o da tela de bloqueio delega ao pipeline existente", () => {
  const activity = semComentariosJava(`${JAVA}/LockNavigationActivity.java`);
  assert.match(activity, /LockNavigationState\.pedirSos\(\)/);
  assert.ok(!/sos_open|supabase|whatsapp/i.test(activity), "nada de segundo caminho de SOS");

  const plugin = semComentariosJava(`${JAVA}/ViagemSeguraPlugin.java`);
  assert.match(plugin, /notifyListeners\("sosTelaBloqueada"/);

  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.match(home, /ouvirSosDaTelaBloqueada\(\(\) => \{[\s\S]{0,200}sos\.trigger\(sos\.holdMs\)/);
});

test("LOCK.18: sem segundo mapa e sem segundo GPS na tela de bloqueio", () => {
  const activity = semComentariosJava(`${JAVA}/LockNavigationActivity.java`);
  const rota = semComentariosJava(`${JAVA}/RotaView.java`);
  for (const fonte of [activity, rota]) {
    assert.ok(!/MapView|GoogleMap|WebView/.test(fonte), "um mapa por viagem");
    assert.ok(
      !/requestLocationUpdates|LocationManager/.test(fonte),
      "a posição vem do serviço que já existe",
    );
  }
});

test("LOCK.19: a Activity se desregistra ao morrer (sem vazamento)", () => {
  const activity = semComentariosJava(`${JAVA}/LockNavigationActivity.java`);
  const destroy = activity.slice(activity.indexOf("onDestroy"));
  assert.match(destroy, /removerOuvinte/);
  assert.match(destroy, /removerFechamento/);
  assert.match(destroy, /removeCallbacksAndMessages\(null\)/);
});

test("LOCK.20: a notificação de primeiro plano continua intacta", () => {
  const servico = ler(`${JAVA}/ViagemSeguraService.java`);
  assert.match(servico, /setOngoing\(true\)/);
  assert.match(servico, /VISIBILITY_PUBLIC/);
  assert.match(servico, /CATEGORY_NAVIGATION/);
});

/* ================================================================== *
 * Hotfix físico: acordar a tela bloqueada precisa REAPRESENTAR a tela
 * ================================================================== */

test("LOCK.21: acordar a tela com o keyguard travado pede a Activity de volta", () => {
  const servico = semComentariosJava(`${JAVA}/ViagemSeguraService.java`);
  assert.match(servico, /ACTION_SCREEN_ON/, "sem SCREEN_ON a tela nunca reaparece ao acordar");
  assert.match(servico, /isKeyguardLocked\(\)/, "só faz sentido com o aparelho bloqueado");
  assert.match(servico, /abrirNavegacaoBloqueada\("screen_on"\)/);
});

test("LOCK.22: o registro do receptor sobrevive à API 33+", () => {
  const servico = semComentariosJava(`${JAVA}/ViagemSeguraService.java`);
  assert.match(servico, /RECEIVER_NOT_EXPORTED/);
});

test("LOCK.23: início de Activity declarado para a API 34+, sem overlay", () => {
  const servico = semComentariosJava(`${JAVA}/ViagemSeguraService.java`);
  assert.match(servico, /MODE_BACKGROUND_ACTIVITY_START_ALLOWED/);
  assert.match(servico, /FLAG_ACTIVITY_NEW_TASK/);
  assert.ok(!/SYSTEM_ALERT_WINDOW|TYPE_APPLICATION_OVERLAY/.test(servico));
  assert.ok(!/setTurnScreenOn|requestDismissKeyguard/.test(servico));
});

test("LOCK.24: diagnóstico nativo cobre toda a cadeia do teste físico", () => {
  const servico = semComentariosJava(`${JAVA}/ViagemSeguraService.java`);
  const activity = semComentariosJava(`${JAVA}/LockNavigationActivity.java`);
  for (const marcador of [
    "SERVICE_STARTED",
    "SCREEN_RECEIVER_REGISTERED",
    "SCREEN_OFF_RECEIVED",
    "SCREEN_ON_RECEIVED",
    "TRIP_ACTIVE=",
    "LOCK_NAV_INTENT_CREATED",
    "START_ACTIVITY_ATTEMPT",
    "START_ACTIVITY_SUCCESS",
    "START_ACTIVITY_EXCEPTION",
  ]) {
    assert.match(servico, new RegExp(marcador));
  }
  for (const marcador of [
    "LOCK_ACTIVITY_ON_CREATE",
    "LOCK_ACTIVITY_ON_START",
    "LOCK_ACTIVITY_ON_RESUME",
    "LOCK_ACTIVITY_ON_PAUSE",
    "LOCK_ACTIVITY_ON_STOP",
    "LOCK_ACTIVITY_ON_DESTROY",
  ]) {
    assert.match(activity, new RegExp(marcador));
  }
  assert.match(servico, /LOG_LOCK = "MOTOANJO_LOCK"/);
});

test("LOCK.25: histórico local é debug-only, limitado e sem payload sensível", () => {
  const diagnostico = ler(`${JAVA}/LockDiagnostics.java`);
  const plugin = ler(`${JAVA}/ViagemSeguraPlugin.java`);
  assert.match(diagnostico, /FLAG_DEBUGGABLE/);
  assert.ok(!/BuildConfig\.DEBUG/.test(diagnostico));
  assert.ok(!/BuildConfig\.DEBUG/.test(plugin));
  assert.match(diagnostico, /LIMITE = 50/);
  assert.match(diagnostico, /System\.currentTimeMillis\(\)/);
  assert.ok(!/lat|lng|token|session|email|phone/i.test(diagnostico));
  assert.match(plugin, /diagnosticoLock/);
  assert.match(plugin, /limparDiagnosticoLock/);
});

/* ================================================================== *
 * P0.1c — Fase A (latência), Fase B (mapa real) e Fase C (degradado)
 * ================================================================== */

test("LOCK.26: abrir não depende do quadro congelado da WebView", () => {
  const servico = semComentariosJava(`${JAVA}/ViagemSeguraService.java`);
  assert.match(
    servico,
    /final boolean viagemAtiva = ativoAgora \|\| q\.ativa/,
    "com a tela apagada a WebView congela; a verdade é o serviço em primeiro plano",
  );
  assert.match(servico, /permitidaLembrada\(\)/);
  assert.match(servico, /RETENTATIVAS_MS/, "rajada curta vence recusa transitória do keyguard");
  assert.match(servico, /tentarAbrirEmRajada\("screen_on_retry"\)/);
  assert.match(servico, /LOCK_ACTIVITY_ALREADY_UP/, "sem empilhar Activity já viva");
});

test("LOCK.27: a posição do bloqueio vem do GPS que já existe", () => {
  const servico = semComentariosJava(`${JAVA}/ViagemSeguraService.java`);
  assert.match(servico, /LockNavigationState\.atualizarPosicao\(/);
  const estado = semComentariosJava(`${JAVA}/LockNavigationState.java`);
  assert.match(estado, /public static void atualizarPosicao/);
  assert.match(estado, /activityViva/);
});

test("LOCK.28: mapa real na tela bloqueada, sem SDK e sem segundo GPS", () => {
  const mapa = semComentariosJava(`${JAVA}/MapaTilesView.java`);
  assert.match(mapa, /class MapaTilesView extends RotaView/, "fallback herdado, não duplicado");
  assert.match(mapa, /tile\.openstreetmap\.org/);
  assert.ok(!/GoogleMap|MapFragment|WebView/.test(mapa), "um mapa por viagem");
  assert.ok(!/requestLocationUpdates|LocationManager/.test(mapa), "posição vem do serviço");
  assert.ok(!/api_key|API_KEY|key=/.test(mapa), "nenhuma chave vai para a tela de bloqueio");
});

test("LOCK.29: sem rede o mapa degrada em vez de ficar vazio", () => {
  const mapa = semComentariosJava(`${JAVA}/MapaTilesView.java`);
  assert.match(mapa, /if \(!algumTile\) \{[\s\S]{0,200}super\.onDraw\(canvas\)/);
  assert.match(mapa, /encerrar\(\)/, "threads morrem com a Activity");
  const activity = semComentariosJava(`${JAVA}/LockNavigationActivity.java`);
  assert.match(activity, /mapa\.encerrar\(\)/);
});

test("LOCK.30: latência e mapa passam a ser mensuráveis no aparelho", () => {
  const diagnostico = semComentariosJava(`${JAVA}/LockDiagnostics.java`);
  for (const marcador of ["FIRST_STATE_RENDER", "MAP_READY", "LOCK_ACTIVITY_ALREADY_UP"]) {
    assert.match(diagnostico, new RegExp(marcador));
  }
  const activity = semComentariosJava(`${JAVA}/LockNavigationActivity.java`);
  assert.match(activity, /FIRST_STATE_RENDER/);
  const mapa = semComentariosJava(`${JAVA}/MapaTilesView.java`);
  assert.match(mapa, /MAP_READY/);
});
