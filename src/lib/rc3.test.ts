import test from "node:test";
import assert from "node:assert/strict";
import { CAMADAS, ordemDeCamadas, sosEstaNoTopo } from "./layers.ts";
import {
  _resetarPermissao,
  definirLeitura,
  definirLeituraDireta,
  leituraAtual,
  comTempoLimite,
  estadoQuandoNaoSabemos,
  precisaMostrarGate,
  reconciliarLeitura,
} from "./location-permission.ts";
import {
  MODO_INICIAL,
  calcularInclinacao,
  inclinacaoIndicaQueda,
  proximoModo,
  rumoCardeal,
  suavizarVelocidade,
  velocidadeKmh,
} from "./ride-telemetry.ts";
import {
  VIAGEM_INICIAL,
  cancelarPreparacao,
  carregarViagem,
  deveRastrear,
  finalizarViagem,
  iniciarViagem,
  receberDestino,
  salvarViagem,
  type ArmazenamentoSimples,
} from "./trip.ts";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { MEMORIA_INICIAL, avaliarCopiloto, limparMemoria } from "./safety-copilot.ts";
import { devefalar } from "./voice.ts";
import {
  APARENCIA,
  distanciaCurta,
  eventoParaCartao,
  opacidadeDeRisco,
  ordenarPorAtencao,
  raioDeRisco,
  temDadosNoBackend,
  type EventoNoMapa,
} from "./map-events.ts";

/* ================================================================== *
 * BUG 1 — o gate não pode reaparecer
 * ================================================================== */

test("BUG1: concessão confirmada não cai por resposta ambígua", () => {
  const concedida = { status: "concedida", origem: "nativo" } as const;
  // É exatamente isto que acontecia: a Permissions API do WebView responde
  // pela origem web e devolve "perguntar" mesmo com o Android já concedido.
  for (const ambigua of ["perguntar", "desconhecido", "verificando"] as const) {
    const r = reconciliarLeitura(concedida, { status: ambigua, origem: "web" });
    assert.equal(r.status, "concedida", `${ambigua} não pode derrubar uma concessão`);
  }
});

test("BUG1: recusa explícita derruba, porque a pessoa pode ter revogado", () => {
  const concedida = { status: "concedida", origem: "nativo" } as const;
  assert.equal(reconciliarLeitura(concedida, { status: "negada", origem: "web" }).status, "negada");
  assert.equal(
    reconciliarLeitura(concedida, { status: "negada_permanente", origem: "nativo" }).status,
    "negada_permanente",
  );
});

test("BUG1: sem concessão anterior, a leitura nova vale como veio", () => {
  const nada = { status: "desconhecido", origem: "nenhuma" } as const;
  assert.equal(reconciliarLeitura(nada, { status: "perguntar", origem: "web" }).status, "perguntar");
});

test("BUG1: trocar de aba e voltar não reabre o onboarding", () => {
  _resetarPermissao();
  definirLeituraDireta({ status: "concedida", origem: "web" });
  assert.equal(precisaMostrarGate(leituraAtual().status), false);

  // Volta do segundo plano: o visibilitychange reconsulta e a API responde
  // "prompt". Antes, isto trazia o gate de volta por cima da permissão.
  definirLeitura({ status: "perguntar", origem: "web" });
  assert.equal(leituraAtual().status, "concedida");
  assert.equal(precisaMostrarGate(leituraAtual().status), false, "o gate voltou — bug de novo");
  _resetarPermissao();
});

test("BUG1: 'verificando' nunca é lido como negado", () => {
  assert.equal(precisaMostrarGate("verificando"), false);
  assert.equal(precisaMostrarGate("concedida"), false);
  assert.equal(precisaMostrarGate("negada"), true);
});

test("BUG1: uma posição real re-afirma a concessão sem reconciliar", () => {
  _resetarPermissao();
  definirLeituraDireta({ status: "negada", origem: "web" });
  definirLeituraDireta({ status: "concedida", origem: "web" });
  assert.equal(leituraAtual().status, "concedida");
  _resetarPermissao();
});

/* ================================================================== *
 * BUG 2 — o SOS fica acima de tudo
 * ================================================================== */

test("BUG2: o painel do SOS é a camada mais alta", () => {
  assert.equal(sosEstaNoTopo(), true);
  for (const [nome, valor] of Object.entries(CAMADAS)) {
    if (nome === "painelSos") continue;
    assert.ok(valor < CAMADAS.painelSos, `${nome} está acima do painel do SOS`);
  }
});

test("BUG2: o marcador e os overlays ficam abaixo do SOS", () => {
  // Tudo que o mapa desenha vive dentro da camada `mapa`, que é a mais baixa.
  assert.ok(CAMADAS.mapa < CAMADAS.painelSos);
  assert.ok(CAMADAS.controlesDoMapa < CAMADAS.painelSos);
  assert.ok(CAMADAS.cartoesDoMapa < CAMADAS.painelSos);
});

test("BUG2: o botão SOS fica acima da navegação, para continuar alcançável", () => {
  assert.ok(CAMADAS.sos > CAMADAS.navegacao);
  assert.ok(CAMADAS.sos > CAMADAS.painelInferior);
});

test("BUG2: a ordem de pintura é coerente do fundo para a frente", () => {
  assert.deepEqual(ordemDeCamadas()[0], "mapa");
  assert.deepEqual(ordemDeCamadas().at(-1), "painelSos");
});

/* ================================================================== *
 * Telemetria
 * ================================================================== */

test("velocidade: parado não fica piscando 0-2-0-3", () => {
  for (const ms of [0, 0.2, 0.5, 0.8]) {
    assert.equal(velocidadeKmh({ speedMs: ms }), 0, `${ms} m/s deveria virar 0`);
  }
  assert.equal(velocidadeKmh({ speedMs: 11.1 }), 40);
});

test("velocidade: sem dado é null, nunca um número inventado", () => {
  assert.equal(velocidadeKmh({ speedMs: null }), null);
  assert.equal(velocidadeKmh({ speedMs: NaN }), null);
  assert.equal(velocidadeKmh({ speedMs: -1 }), null);
  assert.equal(velocidadeKmh({ speedMs: 11, accuracyM: 300 }), null, "fix ruim não vira painel");
});

test("velocidade: a suavização tira o tremor", () => {
  assert.equal(suavizarVelocidade([40, 42], 41), 41);
  assert.equal(suavizarVelocidade([], 37), 37);
});

test("rumo: só aparece com movimento", () => {
  assert.equal(rumoCardeal(0, 40), "N");
  assert.equal(rumoCardeal(90, 40), "L");
  assert.equal(rumoCardeal(225, 40), "SO");
  assert.equal(rumoCardeal(360, 40), "N");
  assert.equal(rumoCardeal(90, 0), null, "parado, o heading gira sozinho");
  assert.equal(rumoCardeal(null, 40), null);
});

test("inclinação: sem sensor, a interface recebe null e um aviso honesto", () => {
  const i = calcularInclinacao(null, 40);
  assert.equal(i.graus, null);
  assert.equal(i.confianca, "indisponivel");
  assert.ok(i.aviso);
});

test("inclinação: parado, a leitura é do aparelho e é dito na cara", () => {
  const i = calcularInclinacao(30, 0);
  assert.equal(i.confianca, "baixa");
  assert.match(i.aviso ?? "", /parado/i);
});

test("inclinação: em movimento é limitada à faixa da interface", () => {
  assert.equal(calcularInclinacao(80, 40).graus, 45);
  assert.equal(calcularInclinacao(-90, 40).graus, -45);
  assert.equal(calcularInclinacao(-12, 40).confianca, "boa");
});

test("SEGURANÇA: inclinação isolada nunca indica queda", () => {
  assert.equal(inclinacaoIndicaQueda(), false);
});

test("modo: só entra em pilotagem com velocidade de verdade", () => {
  assert.equal(proximoModo(MODO_INICIAL, 8, 0).modo, "parado");
  assert.equal(proximoModo(MODO_INICIAL, 20, 0).modo, "pilotando");
});

test("modo: jitter de GPS não faz o painel trocar de layout", () => {
  let e = proximoModo(MODO_INICIAL, 30, 0);
  assert.equal(e.modo, "pilotando");
  // Semáforo: cai a zero, mas volta antes do tempo. Continua pilotando.
  e = proximoModo(e, 0, 1000);
  e = proximoModo(e, 1, 3000);
  e = proximoModo(e, 18, 5000);
  assert.equal(e.modo, "pilotando", "oscilou e trocou de modo");
});

test("modo: parado de verdade volta para o layout completo", () => {
  let e = proximoModo(MODO_INICIAL, 30, 0);
  e = proximoModo(e, 0, 1000);
  e = proximoModo(e, 0, 6000);
  assert.equal(e.modo, "pilotando", "ainda dentro da carência");
  e = proximoModo(e, 0, 9500);
  assert.equal(e.modo, "parado");
});

/* ================================================================== *
 * Viagem Segura
 * ================================================================== */

test("VIAGEM: destino recebido NUNCA inicia a viagem sozinho", () => {
  const v = receberDestino(VIAGEM_INICIAL, "geo:-23.5,-46.6", "externo");
  assert.equal(v.estado, "preparando", "só pode preparar, nunca começar");
  assert.equal(v.destino?.latitude, -23.5);
  assert.equal(v.origemDoDestino, "externo");
});

test("VIAGEM: destino inválido ou perigoso não muda nada", () => {
  for (const ruim of ["javascript:alert(1)", "", "  ", "geo:999,999", null, 42]) {
    assert.equal(receberDestino(VIAGEM_INICIAL, ruim, "externo").estado, "ocioso");
  }
});

test("VIAGEM: ciclo completo", () => {
  const preparando = receberDestino(VIAGEM_INICIAL, "-23.5,-46.6", "manual");
  const ativa = iniciarViagem(preparando, 1000);
  assert.equal(ativa.estado, "ativa");
  assert.equal(ativa.iniciadaEm, 1000);
  assert.equal(deveRastrear(ativa), true);

  const fim = finalizarViagem(ativa, false);
  assert.deepEqual(fim, VIAGEM_INICIAL);
  assert.equal(deveRastrear(fim), false, "listeners da viagem precisam parar");
});

test("VIAGEM: não dá para iniciar sem destino", () => {
  assert.equal(iniciarViagem(VIAGEM_INICIAL, 1000).estado, "ocioso");
});

test("VIAGEM: destino novo não sequestra viagem em curso", () => {
  const ativa = iniciarViagem(receberDestino(VIAGEM_INICIAL, "-23.5,-46.6", "manual"), 1000);
  const depois = receberDestino(ativa, "-22.9,-43.2", "externo");
  assert.equal(depois.estado, "ativa");
  assert.equal(depois.destino?.latitude, -23.5, "o destino da viagem em curso mudou");
});

test("VIAGEM: finalizar viagem não encerra um SOS ativo", () => {
  const ativa = iniciarViagem(receberDestino(VIAGEM_INICIAL, "-23.5,-46.6", "manual"), 1000);
  const fim = finalizarViagem(ativa, true);
  // A viagem acaba; o SOS é assunto de sos_cancel/sos_resolve, e nada aqui
  // encosta nele.
  assert.equal(fim.estado, "ocioso");
});

test("VIAGEM: cancelar a preparação limpa o destino", () => {
  const p = receberDestino(VIAGEM_INICIAL, "-23.5,-46.6", "manual");
  assert.deepEqual(cancelarPreparacao(p), VIAGEM_INICIAL);
});

test("VIAGEM: sobrevive a trocar de aba e remontar a Home", () => {
  const dados: Record<string, string> = {};
  const store: ArmazenamentoSimples = {
    getItem: (k) => dados[k] ?? null,
    setItem: (k, v) => {
      dados[k] = v;
    },
    removeItem: (k) => {
      delete dados[k];
    },
  };
  const ativa = iniciarViagem(receberDestino(VIAGEM_INICIAL, "-23.5,-46.6", "manual"), 1000);
  salvarViagem(ativa, store);

  // Home desmontou e montou de novo:
  const recuperada = carregarViagem(2000, store);
  assert.equal(recuperada.estado, "ativa");
  assert.equal(recuperada.destino?.latitude, -23.5);
});

test("VIAGEM: resquício de 12 h atrás não volta como viagem ativa", () => {
  const dados: Record<string, string> = {};
  const store: ArmazenamentoSimples = {
    getItem: (k) => dados[k] ?? null,
    setItem: (k, v) => {
      dados[k] = v;
    },
    removeItem: (k) => {
      delete dados[k];
    },
  };
  salvarViagem(iniciarViagem(receberDestino(VIAGEM_INICIAL, "-23.5,-46.6", "manual"), 0), store);
  assert.equal(carregarViagem(13 * 60 * 60 * 1000, store).estado, "ocioso");
});

test("VIAGEM: armazenamento corrompido não derruba a Home", () => {
  const store: ArmazenamentoSimples = {
    getItem: () => "{isso não é json",
    setItem: () => {},
    removeItem: () => {},
  };
  assert.deepEqual(carregarViagem(0, store), VIAGEM_INICIAL);
});

test("VIAGEM: destino vindo do armazenamento passa pelo mesmo saneamento", () => {
  const store: ArmazenamentoSimples = {
    getItem: () =>
      JSON.stringify({ estado: "preparando", destino: { address: "javascript:alert(1)" } }),
    setItem: () => {},
    removeItem: () => {},
  };
  const v = carregarViagem(0, store);
  // O endereço é texto, não URL executável — e mesmo assim: se não normalizar
  // para um destino utilizável, a viagem não volta.
  assert.ok(v.estado === "ocioso" || v.destino?.address !== undefined);
});

/* ================================================================== *
 * Eventos do mapa
 * ================================================================== */

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Lê ignorando comentários — de TS/JSX, de XML e de Java.
 *
 * Esta armadilha já pegou este projeto quatro vezes: um comentário que
 * EXPLICA o problema antigo ("ACCESS_BACKGROUND_LOCATION não foi declarada de
 * propósito", "quem encerra é sos_cancel") é lido como se fosse código e
 * reprova o arquivo justamente por ele estar certo. Toda checagem de
 * "isto não pode existir" precisa passar por aqui.
 */
const lerSemComentarios = (p: string) =>
  ler(p)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const ev = (categoria: EventoNoMapa["categoria"], distanciaKm: number, id: string = categoria): EventoNoMapa => ({
  id,
  categoria,
  distanciaKm,
});

test("MAPA: cada categoria tem ícone, forma e cor próprios", () => {
  const combinacoes = new Set(
    Object.values(APARENCIA).map((a) => `${a.forma}|${a.cor}|${a.prioridade}`),
  );
  assert.ok(combinacoes.size >= 6, "categorias diferentes não podem parecer iguais");
  // Cor sozinha não diferencia para quem não distingue cores.
  const formas = new Set(Object.values(APARENCIA).map((a) => a.forma));
  assert.ok(formas.size >= 4);
});

test("MAPA: SOS tem prioridade máxima e é o único que pulsa", () => {
  assert.equal(APARENCIA.sos.prioridade, 0);
  const pulsantes = Object.entries(APARENCIA).filter(([, a]) => a.pulsa);
  assert.deepEqual(pulsantes.map(([n]) => n), ["sos"], "só o SOS pode pulsar");
});

test("MAPA: um SOS longe vem antes de um buraco perto", () => {
  const ordenado = ordenarPorAtencao([ev("buraco", 0.1), ev("sos", 3), ev("posto", 0.05)]);
  assert.equal(ordenado[0].categoria, "sos");
  assert.equal(ordenado.at(-1)?.categoria, "posto");
});

test("MAPA: só um cartão por vez, e POI nunca vira alerta", () => {
  const cartao = eventoParaCartao([ev("posto", 0.1), ev("oficina", 0.2)]);
  assert.equal(cartao, null, "apoio é consulta, não alerta");

  const comRisco = eventoParaCartao([ev("posto", 0.1), ev("acidente", 0.5), ev("buraco", 0.2)]);
  assert.equal(comRisco?.categoria, "acidente");
});

test("MAPA: evento distante demais não vira cartão", () => {
  assert.equal(eventoParaCartao([ev("buraco", 8)]), null);
  assert.equal(eventoParaCartao([ev("sos", 4)])?.categoria, "sos");
  assert.equal(eventoParaCartao([ev("sos", 40)]), null);
});

test("MAPA: parado, o alcance do cartão é maior", () => {
  assert.equal(eventoParaCartao([ev("buraco", 1.5)], "pilotando"), null);
  assert.equal(eventoParaCartao([ev("buraco", 1.5)], "parado")?.categoria, "buraco");
});

test("MAPA: mapa vazio não quebra nada", () => {
  assert.equal(eventoParaCartao([]), null);
  assert.deepEqual(ordenarPorAtencao([]), []);
});

test("MAPA: as manchas de risco deixaram de cobrir bairros", () => {
  assert.ok(raioDeRisco(0) <= 200, "mancha inicial precisa ser pequena");
  assert.ok(raioDeRisco(50) <= 400, "e ter teto, por mais ocorrências que existam");
  assert.ok(opacidadeDeRisco(50) <= 0.14, "opacidade não pode esconder o nome da rua");
});

test("MAPA: categorias sem dado no banco são declaradas, não inventadas", () => {
  assert.equal(temDadosNoBackend("sos"), true);
  assert.equal(temDadosNoBackend("buraco"), false, "buraco ainda não existe em community_alerts");
  assert.equal(temDadosNoBackend("blitz"), false);
});

test("MAPA: distância é escrita do jeito que se lê de relance", () => {
  assert.equal(distanciaCurta(0.18), "180 m");
  assert.equal(distanciaCurta(2.74), "2,7 km");
  assert.equal(distanciaCurta(-1), "—");
});

/* ================================================================== *
 * Safety Copilot
 * ================================================================== */

test("COPILOTO: um aviso por vez, o de maior prioridade", () => {
  const r = avaliarCopiloto(MEMORIA_INICIAL, [ev("buraco", 0.1), ev("sos", 0.3)], 0);
  assert.equal(r.aviso?.categoria, "sos");
  assert.equal(r.falarAgora, true);
});

test("COPILOTO: não repete o mesmo evento antes do cooldown", () => {
  const primeira = avaliarCopiloto(MEMORIA_INICIAL, [ev("acidente", 0.8)], 0);
  assert.equal(primeira.falarAgora, true);
  const segunda = avaliarCopiloto(primeira.memoria, [ev("acidente", 0.79)], 30_000);
  assert.equal(segunda.falarAgora, false, "falou de novo em 30 s");
  assert.equal(segunda.aviso?.categoria, "acidente", "mas continua na tela");
});

test("COPILOTO: repete depois do cooldown", () => {
  const primeira = avaliarCopiloto(MEMORIA_INICIAL, [ev("acidente", 0.8)], 0);
  const depois = avaliarCopiloto(primeira.memoria, [ev("acidente", 0.8)], 120_000);
  assert.equal(depois.falarAgora, true);
});

test("COPILOTO: repete se o perigo ficou bem mais perto", () => {
  const primeira = avaliarCopiloto(MEMORIA_INICIAL, [ev("acidente", 1.2)], 0);
  const perto = avaliarCopiloto(primeira.memoria, [ev("acidente", 0.3)], 10_000);
  assert.equal(perto.falarAgora, true, "chegou perto e ficou calado");
});

test("COPILOTO: eventos diferentes são anunciados separadamente", () => {
  const a = avaliarCopiloto(MEMORIA_INICIAL, [ev("acidente", 0.8, "a1")], 0);
  const b = avaliarCopiloto(a.memoria, [ev("acidente", 0.8, "a1"), ev("sos", 0.5, "s1")], 5_000);
  assert.equal(b.aviso?.id, "s1");
  assert.equal(b.falarAgora, true);
});

test("COPILOTO: sem evento relevante, a tela fica limpa", () => {
  const r = avaliarCopiloto(MEMORIA_INICIAL, [ev("posto", 0.2)], 0);
  assert.equal(r.aviso, null);
  assert.equal(r.falarAgora, false);
});

test("COPILOTO: a memória não cresce para sempre", () => {
  const cheia = { anunciados: { velho: { emMs: 0, distanciaKm: 1 } }, atual: null };
  assert.deepEqual(limparMemoria(cheia, 10_000_000).anunciados, {});
});

test("COPILOTO: a fala é curta e sem sigla", () => {
  const r = avaliarCopiloto(MEMORIA_INICIAL, [ev("buraco", 0.18)], 0, "parado");
  assert.match(r.aviso?.fala ?? "", /^Buraco a \d+ metros\.$/);
  const sos = avaliarCopiloto(MEMORIA_INICIAL, [ev("sos", 0.3)], 0);
  assert.match(sos.aviso?.fala ?? "", /ajuda/i);
});

/* ================================================================== *
 * Voz
 * ================================================================== */

test("VOZ: só fala com viagem ativa, em movimento e com suporte real", () => {
  const base = {
    vozLigada: true,
    suportada: true,
    viagemAtiva: true,
    modo: "pilotando" as const,
    falarAgora: true,
  };
  assert.equal(devefalar(base), true);
  assert.equal(devefalar({ ...base, suportada: false }), false, "sem TTS não promete voz");
  assert.equal(devefalar({ ...base, vozLigada: false }), false);
  assert.equal(devefalar({ ...base, viagemAtiva: false }), false);
  assert.equal(devefalar({ ...base, modo: "parado" }), false, "parado, a pessoa olha a tela");
  assert.equal(devefalar({ ...base, falarAgora: false }), false, "cooldown manda");
});

/* ================================================================== *
 * Android — o OAuth não pode quebrar
 * ================================================================== */

test("ANDROID: o filtro do OAuth continua único e intacto", () => {
  const manifest = ler("android/app/src/main/AndroidManifest.xml");
  const comAuth = [
    ...manifest.matchAll(/<data android:scheme="com\.motoanjo\.app" android:host="([^"]+)"/g),
  ].map((m) => m[1]);
  assert.ok(comAuth.includes("auth"), "o callback do login sumiu");
  // Nenhum filtro novo pode casar com o callback: todos precisam de host, e
  // um esquema sem host capturaria com.motoanjo.app://auth/callback também.
  const semHost = /<data android:scheme="com\.motoanjo\.app"\s*\/>/.test(manifest);
  assert.equal(semHost, false, "filtro sem host captura o callback do OAuth");
  assert.equal(new Set(comAuth).size, comAuth.length, "host duplicado gera ambiguidade");
});

test("ANDROID: filtros de destino declarados e distintos do OAuth", () => {
  const manifest = ler("android/app/src/main/AndroidManifest.xml");
  assert.ok(/android:scheme="geo"/.test(manifest), "geo: não foi declarado");
  assert.ok(/android:host="destino"/.test(manifest), "deep link próprio de destino");
  assert.ok(/action android:name="android\.intent\.action\.SEND"/.test(manifest));
  assert.ok(/android:mimeType="text\/plain"/.test(manifest));
});

/* ================================================================== *
 * Integração: a Home usa a fonte única
 * ================================================================== */

test("HOME: a Viagem Segura mora na Home, com fonte única", () => {
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.ok(/useTrip\(\)/.test(home), "a Home precisa usar o estado de viagem");
  assert.ok(/CockpitDeViagem/.test(home), "o cockpit precisa estar ligado");
  assert.ok(/PreparacaoDeViagem/.test(home), "a preparação precisa estar na Home");
  assert.ok(!/useState.*viagem|const \[viagem/i.test(home), "nada de estado de viagem local");
});

test("HOME: finalizar viagem informa se há SOS ativo", () => {
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.ok(/finalizar\(sosAtivo\)/.test(home), "finalizar precisa saber do SOS");
  assert.ok(/sos\.sosEventId != null/.test(home), "o SOS ativo vem do controlador existente");
});

test("HOME: o cockpit só liga sensores com a viagem ativa", () => {
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.ok(/useCockpitTelemetry\(viagemAtiva\)/.test(home), "sensor ligado fora da viagem gasta bateria");
  const telemetria = ler("src/hooks/useCockpitTelemetry.ts");
  assert.ok(/clearWatch/.test(telemetria), "o watch precisa ser limpo");
  assert.ok(/removeEventListener\("deviceorientation"/.test(telemetria), "listener precisa sair");
});

/* ================================================================== *
 * Foreground Service — Viagem Segura
 *
 * Estrutural: sem Android SDK aqui, o que dá para provar é que o serviço
 * existe, está declarado corretamente e só é acionado com viagem ativa. A
 * compilação e o comportamento em aparelho são prova do CI e do teste físico.
 * ================================================================== */

const ANDROID_JAVA = "android/app/src/main/java/com/motoanjo/app";

test("FGS.1: o serviço nativo existe", () => {
  const servico = ler(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(/class ViagemSeguraService extends Service/.test(servico));
  assert.ok(/startForeground\(/.test(servico), "precisa entrar em primeiro plano");
});

test("FGS.2: tipo location declarado no Manifest e na chamada da API 34+", () => {
  const manifest = ler("android/app/src/main/AndroidManifest.xml");
  assert.ok(
    /<service[\s\S]*?android:name="\.ViagemSeguraService"[\s\S]*?android:foregroundServiceType="location"/.test(
      manifest,
    ),
    "o serviço precisa declarar foregroundServiceType=location",
  );
  const servico = ler(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(
    /FOREGROUND_SERVICE_TYPE_LOCATION/.test(servico),
    "API 34+ exige o tipo também na chamada de startForeground",
  );
});

test("FGS.3: canal de notificação próprio, sem som e visível na tela de bloqueio", () => {
  const servico = ler(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(/new NotificationChannel\(/.test(servico));
  assert.ok(/IMPORTANCE_LOW/.test(servico), "som a cada atualização seria insuportável");
  assert.ok(/VISIBILITY_PUBLIC/.test(servico), "é isto que mostra o conteúdo na lock screen");
  assert.ok(/setOngoing\(true\)/.test(servico), "a notificação não pode ser dispensada");
});

test("FGS.4: o serviço só sobe com viagem ativa", () => {
  const ponte = ler("src/lib/trip-service.ts");
  assert.equal(/servicoDeveEstarAtivo/.test(ponte), true);
  const hook = ler("src/hooks/useTrip.ts");
  assert.ok(
    /anterior\.estado !== "ativa" && v\.estado === "ativa"[\s\S]{0,120}iniciarServicoDeViagem/.test(hook),
    "iniciar só na transição para ativa",
  );
  assert.ok(
    !/iniciarServicoDeViagem\(\)\s*;?\s*\n\s*\}\s*,\s*\[\]\)/.test(hook),
    "nada de iniciar o serviço no boot",
  );
});

test("FGS.5: finalizar a viagem pede a parada do serviço", () => {
  const hook = ler("src/hooks/useTrip.ts");
  assert.ok(
    /anterior\.estado === "ativa" && v\.estado !== "ativa"[\s\S]{0,120}pararServicoDeViagem/.test(hook),
  );
  const servico = ler(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(/ACAO_PARAR/.test(servico) && /stopSelf\(\)/.test(servico));
});

test("FGS: nada de serviço órfão", () => {
  const servico = ler(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(/onTaskRemoved/.test(servico), "remover dos recentes precisa matar o serviço");
  assert.ok(
    /START_NOT_STICKY/.test(servico),
    "START_STICKY reviveria a viagem sozinho, sem o usuário ter pedido",
  );
  const manifest = ler("android/app/src/main/AndroidManifest.xml");
  assert.ok(/android:stopWithTask="true"/.test(manifest));
  assert.ok(/android:exported="false"/.test(manifest), "ninguém de fora pode iniciar o serviço");
});

test("FGS.6/7: nenhuma permissão invasiva foi adicionada", () => {
  const manifest = lerSemComentarios("android/app/src/main/AndroidManifest.xml");
  assert.ok(!/SYSTEM_ALERT_WINDOW/.test(manifest), "overlay sobre a lock screen é gambiarra");
  assert.ok(!/ACCESS_BACKGROUND_LOCATION/.test(manifest), "o FGS location cobre o caso");
  assert.ok(!/REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/.test(manifest));
});

test("FGS: o plugin é uma ponte fina, sem estado de viagem próprio", () => {
  const plugin = ler(`${ANDROID_JAVA}/ViagemSeguraPlugin.java`);
  assert.ok(/@CapacitorPlugin\(name = "ViagemSegura"\)/.test(plugin));
  for (const metodo of ["iniciar", "atualizar", "parar"]) {
    assert.ok(new RegExp(`public void ${metodo}\\(PluginCall`).test(plugin), `falta ${metodo}`);
  }
  assert.ok(
    !/private (boolean|String) (viagem|trip|estado)/i.test(plugin),
    "o estado da viagem tem fonte única em trip.ts",
  );
  const main = ler(`${ANDROID_JAVA}/MainActivity.java`);
  assert.ok(/registerPlugin\(ViagemSeguraPlugin\.class\)/.test(main), "plugin não registrado");
});

test("FGS: a notificação carrega destino e próximo alerta", () => {
  const servico = ler(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(/Moto Anjo — Viagem Segura/.test(servico));
  assert.ok(/Protegido/.test(servico));
  assert.ok(/EXTRA_ALERTA/.test(servico) && /EXTRA_DISTANCIA/.test(servico));
  assert.ok(/setContentIntent/.test(servico), "precisa ter como voltar ao cockpit");
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.ok(/atualizarServicoDeViagem/.test(home), "o aviso do copiloto precisa chegar à notificação");
});

test("FGS: fora do Android tudo é inerte, sem quebrar a viagem", () => {
  const ponte = ler("src/lib/trip-service.ts");
  assert.ok(/isNativeApp/.test(ponte));
  assert.ok(/return false;/.test(ponte), "sem plugin, falha em silêncio");
});

/* ================================================================== *
 * Áreas protegidas — nada disso pode ter sido reimplementado
 * ================================================================== */

test("PROTEGIDO: nenhuma RPC de SOS foi reimplementada no RC3", () => {
  const novos = [
    "src/lib/trip.ts",
    "src/lib/trip-service.ts",
    "src/lib/ride-telemetry.ts",
    "src/lib/safety-copilot.ts",
    "src/lib/map-events.ts",
    "src/lib/layers.ts",
    "src/hooks/useTrip.ts",
    "src/hooks/useCockpitTelemetry.ts",
    "src/hooks/useSafetyCopilot.ts",
  ];
  for (const arquivo of novos) {
    const src = lerSemComentarios(arquivo);
    for (const rpc of ["sos_open", "sos_cancel", "sos_resolve", "sos_purge_history"]) {
      assert.ok(!src.includes(rpc), `${arquivo} chama ${rpc} — o SOS tem um caminho só`);
    }
  }
});

test("PROTEGIDO: as migrations RC2 seguem intactas", () => {
  const migrations = readdirSync(join(process.cwd(), "supabase/migrations")).filter((f) =>
    f.endsWith(".sql"),
  );
  assert.equal(migrations.length, 30, "migration criada ou removida no RC3");
  assert.ok(migrations.includes("20260811090000_sos_rpc_ambiguidade_coluna.sql"));
  assert.ok(migrations.includes("20260811120000_rc2b_sos_comunitario.sql"));
  assert.ok(migrations.includes("20260811120100_rc2c_riders_optin.sql"));
});

/* ================================================================== *
 * Localização nativa dentro do serviço
 *
 * Manter o processo vivo não basta: o Android pode suspender a WebView com a
 * tela apagada mesmo com o processo de pé. Estes testes provam que a captura
 * é nativa, presa ao ciclo de vida do serviço.
 * ================================================================== */

test("NATIVO.1: o serviço registra atualização de localização", () => {
  const servico = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(/requestLocationUpdates\(/.test(servico), "nenhuma captura nativa");
  assert.ok(/LocationManager\.GPS_PROVIDER/.test(servico));
  assert.ok(/LocationManager\.NETWORK_PROVIDER/.test(servico), "túnel e garagem precisam de rede");
  assert.ok(/implements LocationListener|new LocationListener/.test(servico));
});

test("NATIVO.2: parar e destruir removem os updates", () => {
  const servico = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(/removeUpdates\(/.test(servico), "GPS ligado depois da viagem é vazamento");
  assert.ok(/pararCaptura\(\)/.test(servico));
  // pararTudo é chamado por ACAO_PARAR, onDestroy e onTaskRemoved.
  const pararTudo = /private void pararTudo\(\)\s*\{([\s\S]*?)\n    \}/.exec(servico)?.[1] ?? "";
  assert.ok(/pararCaptura\(\)/.test(pararTudo), "parar o serviço precisa parar o GPS");
  for (const gatilho of ["onDestroy", "onTaskRemoved"]) {
    assert.ok(new RegExp(`${gatilho}[\\s\\S]{0,220}pararTudo\\(\\)`).test(servico), `${gatilho} não limpa`);
  }
});

test("NATIVO.3: captura só com o serviço em primeiro plano, e idempotente", () => {
  const servico = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(
    /startForeground\([\s\S]{0,200}?emPrimeiroPlano = true;\s*iniciarCaptura\(\);/.test(servico),
    "a captura precisa começar depois de entrar em primeiro plano",
  );
  assert.ok(/if \(capturando \|\| !temPermissaoDeLocalizacao\(\)\) return;/.test(servico));
  assert.ok(!/BOOT_COMPLETED/.test(servico), "nada de iniciar no boot");
});

test("NATIVO: sem permissão o serviço para em vez de derrubar o app", () => {
  const servico = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  // API 34+ lança SecurityException se um FGS `location` subir sem permissão.
  assert.ok(
    /if \(!temPermissaoDeLocalizacao\(\)\)\s*\{\s*pararTudo\(\);/.test(servico),
    "checar antes de startForeground evita crash em quem está pilotando",
  );
  assert.ok(/catch \(SecurityException/.test(servico), "permissão pode cair no meio");
});

test("NATIVO: frequência conservadora, não amostragem contínua", () => {
  const servico = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  const intervalo = Number(/INTERVALO_MS = (\d+)L/.exec(servico)?.[1] ?? 0);
  assert.ok(intervalo >= 3000, `${intervalo} ms é agressivo demais para um turno inteiro`);
  const distancia = Number(/DISTANCIA_M = (\d+)f/.exec(servico)?.[1] ?? 0);
  assert.ok(distancia >= 5, "sem filtro de distância o GPS acorda parado no semáforo");
});

test("NATIVO: a ponte não cria segunda fonte de verdade da viagem", () => {
  const plugin = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraPlugin.java`);
  assert.ok(/notifyListeners\("posicao"/.test(plugin), "falta encaminhar a posição");
  assert.ok(
    !/(viagemAtiva|tripActive|estadoViagem)/i.test(plugin),
    "quem decide se há viagem é o React",
  );
  const ponte = ler("src/lib/trip-service.ts");
  assert.ok(/ouvirPosicaoNativa/.test(ponte));
  assert.ok(/return \(\) => \{\};/.test(ponte), "fora do Android precisa ser inerte");
  const telemetria = ler("src/hooks/useCockpitTelemetry.ts");
  assert.ok(/ouvirPosicaoNativa/.test(telemetria), "o cockpit precisa consumir a posição nativa");
  assert.ok(/if \(!ativo\) return;/.test(telemetria), "só com viagem ativa");
});

test("NATIVO: permissões de FGS location completas para API 34-36", () => {
  const manifest = lerSemComentarios("android/app/src/main/AndroidManifest.xml");
  for (const p of [
    "ACCESS_FINE_LOCATION",
    "ACCESS_COARSE_LOCATION",
    "FOREGROUND_SERVICE",
    "FOREGROUND_SERVICE_LOCATION",
    "POST_NOTIFICATIONS",
  ]) {
    assert.ok(manifest.includes(p), `falta ${p} para o FGS location no targetSdk atual`);
  }
  assert.ok(!/ACCESS_BACKGROUND_LOCATION/.test(manifest), "o FGS location cobre o caso");
  assert.ok(!/SYSTEM_ALERT_WINDOW/.test(manifest));
  assert.ok(!/RECEIVE_BOOT_COMPLETED/.test(manifest), "não há nada para subir no boot");
});

/* ================================================================== *
 * HOTFIX — "Verificando permissões..." para sempre
 *
 * A causa não era lógica de permissão: era ausência de tempo limite.
 * `permissions.query` pode nunca resolver dentro de um iframe com
 * Permissions-Policy bloqueando geolocalização — e try/catch não cobre
 * promessa pendurada.
 * ================================================================== */

test("LOOP.1: promessa pendurada não trava a tela", async () => {
  const nuncaResolve = new Promise<string>(() => {});
  const r = await comTempoLimite(nuncaResolve, 30, "fallback");
  assert.equal(r, "fallback", "sem tempo limite a Home fica no spinner para sempre");
});

test("LOOP.2: promessa que responde a tempo continua valendo", async () => {
  assert.equal(await comTempoLimite(Promise.resolve("real"), 500, "fallback"), "real");
});

test("LOOP.3: promessa rejeitada cai no padrão, sem estourar", async () => {
  assert.equal(await comTempoLimite(Promise.reject(new Error("x")), 500, "fallback"), "fallback");
});

test("LOOP.4: quando não dá para saber, vira botão — nunca 'desconhecido'", () => {
  const semNada = estadoQuandoNaoSabemos({ status: "desconhecido", origem: "nenhuma" });
  assert.equal(semNada.status, "perguntar", "spinner eterno é pior que botão errado");
  assert.equal(precisaMostrarGate(semNada.status), true, "e o gate precisa oferecer ação");
});

test("LOOP.5: quem já concedeu não volta para o onboarding no fallback", () => {
  const jaTinha = estadoQuandoNaoSabemos({ status: "concedida", origem: "nativo" });
  assert.equal(jaTinha.status, "concedida");
  assert.equal(precisaMostrarGate(jaTinha.status), false);
});

test("LOOP.6: 'desconhecido' é o único estado que mostra spinner — e ele agora expira", () => {
  // Este é o par que causava o bug: desconhecido => verificando => spinner.
  assert.equal(precisaMostrarGate("desconhecido"), true);
  const lib = ler("src/lib/location-permission.ts");
  assert.ok(/LIMITE_DE_CONSULTA_MS/.test(lib), "falta o tempo limite");
  assert.ok(
    /comTempoLimite\([\s\S]{0,400}?perms\.query/.test(lib),
    "a consulta do navegador precisa ter tempo limite",
  );
  const hook = ler("src/hooks/useLocationPermission.ts");
  assert.ok(/setTimeout\(/.test(hook), "falta a trava de segurança no hook");
  assert.ok(/estadoQuandoNaoSabemos/.test(hook));
});

test("LOOP.7: web e Android são caminhos separados", () => {
  const lib = lerSemComentarios("src/lib/location-permission.ts");
  assert.ok(/if \(isNativeApp\(\)\) \{/.test(lib), "o caminho nativo precisa ser explícito");
  assert.ok(
    /perms\?\.query/.test(lib),
    "e o navegador não pode depender do plugin do Capacitor",
  );
  // Sem Permissions API o fluxo continua: cai no estado determinístico.
  assert.ok(/estadoQuandoNaoSabemos\(anterior\)/.test(lib));
});

test("LOOP.8: trocar de aba com permissão concedida continua sem onboarding", () => {
  _resetarPermissao();
  definirLeituraDireta({ status: "concedida", origem: "nativo" });
  // Volta do segundo plano e a consulta não responde: o fallback preserva.
  definirLeitura(estadoQuandoNaoSabemos(leituraAtual()));
  assert.equal(leituraAtual().status, "concedida");
  assert.equal(precisaMostrarGate(leituraAtual().status), false);
  _resetarPermissao();
});

/* ================================================================== *
 * Como o frontend chega ao APK
 * ================================================================== */

test("APK: a URL do WebView é configurável em tempo de build", () => {
  const config = ler("capacitor.config.ts");
  assert.ok(/process\.env\.MOTOANJO_WEB_URL/.test(config), "URL fixa no código impede o CI de apontar para o commit certo");
  assert.ok(/url: urlDoApp/.test(config));
  assert.ok(/URL_PADRAO = "https:\/\//.test(config), "precisa de padrão para não quebrar quem não define a variável");
});

test("APK: o host configurado entra na navegação permitida", () => {
  const config = ler("capacitor.config.ts");
  assert.ok(/hostDe\(urlDoApp\)/.test(config), "domínio próprio seria bloqueado pelo próprio WebView");
});

test("APK: o motivo de não embutir o frontend está escrito, não subentendido", () => {
  const config = ler("capacitor.config.ts");
  assert.ok(/createServerFn|server function/i.test(config));
  assert.ok(/triggerSos/.test(config), "quem tentar remover server.url precisa saber que o SOS depende disso");
});

test("APK: o CI declara qual frontend o APK carrega e nomeia o artefato", () => {
  const wf = ler(".github/workflows/android.yml");
  assert.ok(/moto-anjo-RC3-hotfix\.apk/.test(wf), "artefato precisa de nome claro");
  assert.ok(/APK_WEB_URL/.test(wf), "o log precisa dizer qual URL o APK abre");
  assert.ok(/frontend embutido no APK: NAO/.test(wf), "o metadado precisa ser honesto");
  assert.ok(/MOTOANJO_WEB_URL/.test(wf));
  // O artefato continua saindo só depois de tudo verde.
  assert.ok(/if: success\(\)/.test(wf));
});

/* ================================================================== *
 * A Home renderiza o RC3 de verdade — caminho, não só import
 * ================================================================== */

test("HOME: o caminho de render chega ao cockpit", () => {
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  // Sem permissão: gate. Com permissão: mapa + estados da viagem.
  const semPermissao = /if \(!granted\) \{([\s\S]*?)\n  \}/.exec(home)?.[1] ?? "";
  assert.ok(/LocationPermissionGate/.test(semPermissao), "sem permissão precisa mostrar o gate");

  const posGate = home.slice(home.indexOf("if (!granted)"));
  for (const peca of [
    "<RealMap",
    "<ChamadaViagemSegura",
    "<PreparacaoDeViagem",
    "<CockpitDeViagem",
    "<DestinoDialog",
    "<SosFab",
  ]) {
    assert.ok(posGate.includes(peca), `${peca} não é alcançado no render da Home`);
  }
});

test("HOME: os três estados da viagem são mutuamente exclusivos e completos", () => {
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.ok(/viagem\.estado === "ocioso" &&[\s\S]{0,80}ChamadaViagemSegura/.test(home));
  assert.ok(/viagem\.estado === "preparando" &&[\s\S]{0,80}PreparacaoDeViagem/.test(home));
  assert.ok(/\{viagemAtiva &&[\s\S]{0,80}CockpitDeViagem/.test(home));
});
