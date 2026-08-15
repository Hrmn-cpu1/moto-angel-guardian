import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  SERVICO_INICIAL,
  consultarPermissaoDeNotificacao,
  descricaoDoServico,
  estadoAtualDoServico,
  iniciarServicoDeViagem,
  montarAtualizacaoDaViagem,
  pararServicoDeViagem,
  pedirPermissaoDeNotificacao,
  type EstadoServicoViagem,
} from "./trip-service.ts";
import { abrirUrlExterna, urlExternaSegura, type PonteExterna } from "./external-navigation.ts";

/**
 * RC4 — lote Android P0/P1.
 *
 * Cada teste aqui existe porque um defeito REAL passou por ele:
 *   . POST_NOTIFICATIONS declarada e nunca pedida (tela de bloqueio vazia);
 *   . plugin respondendo `ativo:true` com o serviço recusado;
 *   . destino apagado na primeira atualização da notificação;
 *   . wa.me abrindo dentro da WebView principal, no caminho do SOS;
 *   . dois workflows publicando APK, um deles com metadado falso.
 */

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Comentário não é código: descrever o bug antigo não pode reprovar o arquivo. */
const lerSemComentarios = (p: string) =>
  ler(p)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const ANDROID_JAVA = "android/app/src/main/java/com/motoanjo/app";

/* ================================================================== *
 * Plugin de teste
 * ================================================================== */

type Plugin = Record<string, unknown>;

function instalarPlugin(p: Plugin | null) {
  const capacitor = { isNativePlatform: () => true, Plugins: p ? { ViagemSegura: p } : {} };
  (globalThis as Record<string, unknown>).window = {
    location: { pathname: "/dashboard", href: "http://localhost/dashboard" },
    navigator: { userAgent: "test" },
    Capacitor: capacitor,
  };
  (globalThis as Record<string, unknown>).Capacitor = capacitor;
}

function limpar() {
  delete (globalThis as Record<string, unknown>).Capacitor;
  delete (globalThis as Record<string, unknown>).window;
}

/* ================================================================== *
 * 1. Permissão de notificação (Android 13+)
 * ================================================================== */

test("PERM.1: a permissão é pedida ANTES de subir o serviço", async () => {
  const ordem: string[] = [];
  instalarPlugin({
    pedirPermissaoNotificacao: async () => {
      ordem.push("permissao");
      return { suportaRuntime: true, concedida: true, podeMostrar: true };
    },
    iniciar: async () => {
      ordem.push("iniciar");
      return { ativo: true, notificacaoVisivel: true, motivo: "ativo" };
    },
    addListener: () => ({ remove: () => {} }),
  });
  await iniciarServicoDeViagem("Centro");
  assert.deepEqual(ordem, ["permissao", "iniciar"], "pedir depois deixa a 1ª viagem sem aviso");
  limpar();
});

test("PERM.2: permissão negada não derruba nada e vira estado controlado", async () => {
  instalarPlugin({
    pedirPermissaoNotificacao: async () => ({
      suportaRuntime: true,
      concedida: false,
      podeMostrar: false,
    }),
    iniciar: async () => ({
      ativo: true,
      notificacaoVisivel: false,
      motivo: "sem_permissao_notificacao",
    }),
    addListener: () => ({ remove: () => {} }),
  });
  const permissao = await pedirPermissaoDeNotificacao();
  assert.equal(permissao.concedida, false);
  const estado = await iniciarServicoDeViagem("Centro");
  // Serviço de pé E sem aviso na tela: são perguntas diferentes de propósito.
  assert.equal(estado.ativo, true);
  assert.equal(estado.notificacaoVisivel, false);
  assert.match(descricaoDoServico(estado), /notifica/i);
  limpar();
});

test("PERM.3: plugin que LANÇA ao pedir permissão não impede a viagem", async () => {
  instalarPlugin({
    pedirPermissaoNotificacao: () => {
      throw new Error("sem activity");
    },
    iniciar: async () => ({ ativo: true, notificacaoVisivel: true, motivo: "ativo" }),
    addListener: () => ({ remove: () => {} }),
  });
  const permissao = await pedirPermissaoDeNotificacao();
  assert.equal(permissao.concedida, false, "falha desconhecida nunca vira concedida");
  const estado = await iniciarServicoDeViagem("Centro");
  assert.equal(estado.ativo, true, "a viagem não pode cair por causa do diálogo");
  limpar();
});

test("PERM.4: sem plugin, nada é prometido", async () => {
  instalarPlugin(null);
  assert.deepEqual(await consultarPermissaoDeNotificacao(), {
    suportaRuntime: false,
    concedida: false,
    podeMostrar: false,
  });
  const estado = await iniciarServicoDeViagem("Centro");
  assert.equal(estado.ativo, false);
  assert.equal(estado.motivo, "sem_plugin");
  limpar();
});

/* ================================================================== *
 * 2. Estado REAL do serviço
 * ================================================================== */

test("FGS.R1: serviço recusado nunca vira ativo=true", async () => {
  instalarPlugin({
    pedirPermissaoNotificacao: async () => ({ concedida: true, podeMostrar: true }),
    // Foi exatamente isto que o Android respondia enquanto o app dizia
    // "protegido": recusa por falta de permissão de localização.
    iniciar: async () => ({
      ativo: false,
      notificacaoVisivel: true,
      motivo: "sem_permissao_localizacao",
      solicitado: false,
    }),
    addListener: () => ({ remove: () => {} }),
  });
  const estado = await iniciarServicoDeViagem("Centro");
  assert.equal(estado.ativo, false);
  assert.equal(estado.motivo, "sem_permissao_localizacao");
  assert.equal(estadoAtualDoServico().ativo, false, "o espelho precisa acompanhar");
  assert.match(descricaoDoServico(estado), /localiza/i);
  limpar();
});

test("FGS.R2: resposta sem os campos não é lida como sucesso", async () => {
  instalarPlugin({
    pedirPermissaoNotificacao: async () => ({}),
    // Plugin antigo, resposta vazia: a ausência de prova não é prova.
    iniciar: async () => ({}),
    addListener: () => ({ remove: () => {} }),
  });
  const estado = await iniciarServicoDeViagem("Centro");
  assert.equal(estado.ativo, false);
  assert.equal(estado.notificacaoVisivel, false);
  limpar();
});

test("FGS.R3: motivo desconhecido não passa cru para a tela", async () => {
  instalarPlugin({
    pedirPermissaoNotificacao: async () => ({}),
    iniciar: async () => ({ ativo: false, motivo: "<script>alert(1)</script>" }),
    addListener: () => ({ remove: () => {} }),
  });
  const estado = await iniciarServicoDeViagem("Centro");
  assert.equal(estado.motivo, "parado", "só a lista fechada de motivos entra");
  limpar();
});

test("FGS.R4: parar publica estado parado mesmo sem plugin", async () => {
  instalarPlugin(null);
  await pararServicoDeViagem();
  assert.equal(estadoAtualDoServico().ativo, false);
  assert.equal(SERVICO_INICIAL.ativo, false, "o estado inicial não promete nada");
  limpar();
});

test("FGS.R5: cada motivo tem frase própria, nenhuma genérica", () => {
  const motivos: EstadoServicoViagem["motivo"][] = [
    "parado",
    "sem_permissao_localizacao",
    "sem_permissao_notificacao",
    "falha_ao_iniciar",
    "sem_plugin",
  ];
  const frases = motivos.map((motivo) =>
    descricaoDoServico({ ativo: false, notificacaoVisivel: false, motivo, solicitado: false }),
  );
  assert.equal(new Set(frases).size, frases.length, "frase repetida esconde a causa");
  const ativa = descricaoDoServico({
    ativo: true,
    notificacaoVisivel: true,
    motivo: "ativo",
    solicitado: true,
  });
  assert.ok(!frases.includes(ativa));
});

/* ================================================================== *
 * 3. Notificação: o destino não pode sumir
 * ================================================================== */

test("NOTIF.1: atualização parcial NÃO manda destino vazio", () => {
  // O bug: a Home mandava só alerta e distância, o plugin completava
  // destino com "" e o serviço remontava a notificação do zero.
  const a = montarAtualizacaoDaViagem({ alerta: "Risco", distanciaDoAlerta: "300 m" });
  assert.ok(!("destino" in a), "chave ausente = o Android mantém o que já sabe");
  assert.equal(a.alerta, "Risco");
  assert.equal(a.distancia, "300 m");
});

test("NOTIF.2: destino conhecido viaja junto e sobrevive ao alerta", () => {
  const a = montarAtualizacaoDaViagem({ destino: "Av. Brasil, 500", alerta: "Risco" });
  assert.equal(a.destino, "Av. Brasil, 500");
  const b = montarAtualizacaoDaViagem({ destino: "  ", alerta: "" });
  assert.ok(!("destino" in b), "espaço em branco não é destino");
});

test("NOTIF.3: alerta e manobra podem ser limpos; destino nunca é apagado", () => {
  const a = montarAtualizacaoDaViagem({ destino: "Centro" });
  assert.equal(a.alerta, "", "campo transitório vai vazio para limpar");
  assert.equal(a.manobra, "");
  assert.equal(a.destino, "Centro");
});

test("NOTIF.4: nada é inventado para preencher a notificação", () => {
  // Distância sem instrução não vira manobra; distância sem alerta não vira
  // distância de alerta.
  const a = montarAtualizacaoDaViagem({ distanciaDaManobra: "200 m", distanciaDoAlerta: "1 km" });
  assert.equal(a.manobra, "");
  assert.equal(a.distancia, "");
  const b = montarAtualizacaoDaViagem({ manobra: "Av. Brasil", distanciaDaManobra: "200 m" });
  assert.equal(b.manobra, "200 m · Av. Brasil");
  const c = montarAtualizacaoDaViagem({ manobra: "Av. Brasil" });
  assert.equal(c.manobra, "Av. Brasil");
});

test("NOTIF.5: o serviço mantém o campo que não veio no Intent", () => {
  const servico = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  for (const extra of ["EXTRA_DESTINO", "EXTRA_ALERTA", "EXTRA_DISTANCIA", "EXTRA_MANOBRA"]) {
    assert.ok(
      new RegExp(`hasExtra\\(${extra}\\)`).test(servico),
      `${extra} sem hasExtra: atualização parcial apaga o campo`,
    );
  }
  assert.ok(/private String destinoAtual/.test(servico), "sem memória, o destino some");
  const plugin = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraPlugin.java`);
  assert.ok(
    /if \(v != null\) i\.putExtra\(extra, v\);/.test(plugin),
    "o plugin não pode inventar \"\" para campo que o JS não mandou",
  );
  assert.ok(
    !/getString\("destino", ""\)[\s\S]{0,80}ACAO_ATUALIZAR/.test(plugin),
    "destino com default vazio na atualização é o bug de volta",
  );
});

test("NOTIF.6: a próxima manobra chega à notificação, vinda da rota real", () => {
  const home = lerSemComentarios("src/routes/_authenticated/dashboard.tsx");
  assert.ok(/montarAtualizacaoDaViagem\(/.test(home));
  assert.ok(/destino: destinoDaNotificacao/.test(home), "o destino precisa ir junto");
  assert.ok(/viaDaInstrucao\(rota\?\.proximaInstrucao\)/.test(home), "manobra inventada não");
});

/* ================================================================== *
 * 4. Serviço nativo: falhar sem derrubar
 * ================================================================== */

test("FGS.N1: startForeground é protegido e publica o motivo da falha", () => {
  const servico = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(
    /try \{[\s\S]{0,400}startForeground\([\s\S]{0,400}\} catch \(Exception/.test(servico),
    "API 31+ recusa FGS vindo do segundo plano e lança",
  );
  assert.ok(/MOTIVO_FALHA_FOREGROUND/.test(servico));
  assert.ok(/publicarEstado\(/.test(servico), "falhar em silêncio é o defeito original");
});

test("FGS.N2: o serviço distingue rodar de aparecer", () => {
  const servico = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(/areNotificationsEnabled\(\)/.test(servico), "é o que diz se a notificação aparece");
  assert.ok(/MOTIVO_SEM_NOTIFICACAO/.test(servico));
  assert.ok(
    /publicarEstado\(true, visivel, visivel \? MOTIVO_ATIVO : MOTIVO_SEM_NOTIFICACAO\)/.test(
      servico,
    ),
    "serviço de pé com notificação bloqueada não pode ser anunciado como ativo pleno",
  );
});

test("FGS.N3: o plugin pede permissão e nunca responde ativo por otimismo", () => {
  const plugin = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraPlugin.java`);
  assert.ok(/POST_NOTIFICATIONS/.test(plugin), "a permissão precisa estar na anotação");
  assert.ok(/@PermissionCallback/.test(plugin), "sem callback o pedido não retorna");
  assert.ok(/requestPermissionForAlias\(/.test(plugin));
  // O defeito literal que estava aqui.
  assert.ok(!/resolve\(estado\(true\)\)/.test(plugin), "ativo=true fixo é o bug original");
  assert.ok(!/put\("ativo", true\)/.test(plugin), "ninguém escreve ativo=true na mão");
  assert.ok(
    /ViagemSeguraService\.estaAtivo\(\)/.test(plugin),
    "o estado tem de vir do serviço, não de um palpite do plugin",
  );
  assert.ok(/catch \(Exception e\)/.test(plugin), "startForegroundService pode lançar");
});

test("FGS.N4: a Home mostra o estado real, sem deduzir da viagem", () => {
  const home = lerSemComentarios("src/routes/_authenticated/dashboard.tsx");
  assert.ok(/const \{ viagem, servico/.test(home), "a Home precisa ler o estado do serviço");
  assert.ok(/descricaoDoServico\(servico\)/.test(home));
  assert.ok(
    /ok: servico\.ativo && servico\.notificacaoVisivel/.test(home),
    "indicador verde com notificação bloqueada é promessa falsa",
  );
  const barra = lerSemComentarios("src/components/HomeTopBar.tsx");
  assert.ok(/segundoPlano/.test(barra));
  assert.ok(/tripActive && segundoPlano/.test(barra), "fora da viagem não há o que reportar");
});

/* ================================================================== *
 * 5. Nada externo pode substituir a WebView principal
 * ================================================================== */

function ponteFalsa(aceitaJanela: boolean, nativo = true) {
  const abertas: string[] = [];
  const ponte: PonteExterna = {
    nativo: () => nativo,
    abrirJanela: (url) => {
      if (!aceitaJanela) return false;
      abertas.push(url);
      return true;
    },
    abrirNavegadorNativo: async (url) => {
      abertas.push(url);
    },
  };
  return { ponte, abertas };
}

test("EXT.1: só HTTPS sai daqui", () => {
  for (const ruim of [
    "javascript:alert(1)",
    "intent://send#Intent;scheme=whatsapp;end",
    "data:text/html,<script>",
    "file:///etc/passwd",
    "content://com.android/x",
    "whatsapp://send?text=oi",
    "http://wa.me/5511999999999",
    "/dashboard",
    "",
    null,
    42,
  ]) {
    assert.equal(urlExternaSegura(ruim), null, `${String(ruim)} não pode passar`);
  }
  assert.ok(urlExternaSegura("https://wa.me/5511999999999?text=oi"));
});

test("EXT.2: URL recusada não abre nada", async () => {
  const { ponte, abertas } = ponteFalsa(true);
  const r = await abrirUrlExterna("intent://x", ponte);
  assert.equal(r.ok, false);
  assert.equal(abertas.length, 0);
});

test("EXT.3: cai para o navegador nativo quando a janela não abre", async () => {
  const { ponte, abertas } = ponteFalsa(false);
  const r = await abrirUrlExterna("https://wa.me/55119?text=oi", ponte);
  assert.equal(r.ok, true);
  assert.equal(r.via, "navegador-nativo");
  assert.equal(abertas.length, 1);
});

test("EXT.4: o SOS abre o WhatsApp pela ponte, nunca pela WebView", () => {
  const painel = lerSemComentarios("src/components/SosPanel.tsx");
  assert.ok(/abrirUrlExterna\(r\.href\)/.test(painel));
  assert.ok(!/target="_blank"/.test(painel), "_blank devolve o wa.me para a WebView");
  assert.ok(!/window\.open/.test(painel));
  assert.ok(!/<a\b/.test(painel), "link cru no painel do SOS é como o bug voltava");
});

test("EXT.5: nenhuma tela navega para fora por conta própria", () => {
  const telas = readdirSync(join(process.cwd(), "src/routes/_authenticated")).filter((f) =>
    f.endsWith(".tsx"),
  );
  for (const f of [...telas.map((f) => `src/routes/_authenticated/${f}`)]) {
    const src = lerSemComentarios(f);
    assert.ok(!/window\.open\(/.test(src), `${f} abre janela sem passar pela ponte`);
    assert.ok(!/target="_blank"/.test(src), `${f} usa _blank em vez da ponte`);
    assert.ok(!/location\.href\s*=\s*["'`]https?:/.test(src), `${f} troca a WebView de página`);
  }
});

test("EXT.6: WhatsApp fora da navegação permitida do WebView", () => {
  const config = lerSemComentarios("capacitor.config.ts");
  assert.ok(!/"wa\.me"/.test(config), "listar wa.me AUTORIZA a WebView a navegar para lá");
  assert.ok(!/whatsapp\.com/.test(config));
  // O host do próprio app continua permitido: sem ele nada carrega.
  assert.ok(/hostDe\(urlDoApp\)/.test(config));
});

/* ================================================================== *
 * 6. CI: um fluxo só, com versão real
 * ================================================================== */

test("CI.1: existe um único workflow de Android", () => {
  const wfs = readdirSync(join(process.cwd(), ".github/workflows"));
  const android = wfs.filter((f) => /android/i.test(f));
  assert.deepEqual(android, ["android.yml"], `dois fluxos disputando o push: ${android.join(", ")}`);
  assert.ok(!existsSync(join(process.cwd(), ".github/workflows/android-debug.yml")));
});

test("CI.2: a versão do APK vem do build.gradle, não do YAML", () => {
  const wf = ler(".github/workflows/android.yml");
  assert.ok(/grep -oE "versionCode \+\[0-9\]\+" android\/app\/build\.gradle/.test(wf));
  assert.ok(/moto-anjo-\$\{VNAME\}-\$\{VCODE\}-debug\.apk/.test(wf));
  // `v3` cru pegava `setup-android@v3`, que é a versão da ACTION. O que não
  // pode voltar é versão do APP escrita à mão no YAML, ou nome fixo de APK.
  const semComentario = wf.replace(/^\s*#.*$/gm, "");
  assert.ok(!/versionCode:? +\d/.test(semComentario), "versionCode fixo no YAML");
  assert.ok(!/versionName:? +\d/.test(semComentario), "versionName fixo no YAML");
  assert.ok(!/moto-anjo-RC\d/.test(semComentario), "nome de APK preso a um RC antigo");
  // O artefato continua saindo só depois de tudo verde.
  assert.ok(/if: success\(\)/.test(wf));
});

/* ================================================================== *
 * 7. Áreas que este lote NÃO podia tocar
 * ================================================================== */

test("ESCOPO: SOS, RLS e migrations intactos neste lote", () => {
  const migrations = readdirSync(join(process.cwd(), "supabase/migrations")).filter((f) =>
    f.endsWith(".sql"),
  );
  /* O lote Android não podia mexer em banco. Contagem fixa, porém, quebra a
   * cada migration legítima de outro lote sem provar nada: o que interessa é
   * que nada tenha sumido e que nenhuma migration apague dado. */
  assert.ok(migrations.length >= 32, "migration removida do repositório");
  for (const f of migrations) {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8").toUpperCase();
    // DELETE não entra na lista: `sos_purge_history` apaga histórico de
    // propósito, a pedido do dono do dado. DROP TABLE e TRUNCATE não têm
    // uso legítimo aqui.
    for (const destrutivo of ["DROP TABLE ", "TRUNCATE "]) {
      assert.ok(!sql.includes(destrutivo), `${f} contém DDL destrutivo: ${destrutivo}`);
    }
  }
  for (const arquivo of [
    "src/lib/trip-service.ts",
    "src/lib/external-navigation.ts",
    "src/hooks/useTrip.ts",
    "src/components/HomeTopBar.tsx",
    "src/components/RideCockpit.tsx",
  ]) {
    const src = lerSemComentarios(arquivo);
    for (const rpc of ["sos_open", "sos_cancel", "sos_resolve", "sos_purge_history"]) {
      assert.ok(!src.includes(rpc), `${arquivo} mexeu no SOS`);
    }
  }
});

test("ESCOPO: nada de SensorManager ou countdown de queda neste lote", () => {
  const servico = lerSemComentarios(`${ANDROID_JAVA}/ViagemSeguraService.java`);
  assert.ok(!/SensorManager|TYPE_LINEAR_ACCELERATION/.test(servico), "fora do escopo deste lote");
});
