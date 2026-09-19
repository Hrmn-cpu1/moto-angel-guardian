import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Garantias dos checkpoints RC2-B (SOS comunitário) e RC2-C (riders opt-in).
 *
 * São testes estruturais: leem o SQL e o fonte e provam que as regras estão
 * escritas e ligadas. Não substituem o teste em banco — o que depende de
 * Postgres de verdade está marcado como PHYSICAL/DB VALIDATION REQUIRED no
 * RC2-RELEASE-AUDIT.md.
 */

const RAIZ = process.cwd();
const DIR = "supabase/migrations";
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const MIG_B = "20260811120000_rc2b_sos_comunitario.sql";
const MIG_C = "20260811120100_rc2c_riders_optin.sql";

/** Tira comentários de linha: o texto que EXPLICA um SQL antigo não é SQL. */
function semComentarios(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ");
}

/**
 * O mesmo para TS/JSX. Um comentário que descreve o bug antigo ("antes os
 * dois usavam absolute right-3 top-3") não pode ser lido como código — foi
 * exatamente esse engano que fez um teste desta suíte falhar por engano.
 */
function semComentariosTs(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/**
 * Corpo de uma função, ancorado no CREATE. Sem a âncora, uma menção ao nome
 * num comentário de rollback faria a extração pegar a função errada.
 */
function corpoDeFuncao(sql: string, nome: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION\\s+public\\.${nome}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    "i",
  );
  const corpo = re.exec(sql)?.[1] ?? "";
  assert.ok(corpo.length > 0, `corpo de ${nome} não encontrado`);
  return corpo;
}

const sqlB = () => ler(join(DIR, MIG_B));

/**
 * As duas migrations RC2 na ordem em que rodam.
 *
 * Depois da reordenação, QUAL arquivo define um objeto deixou de importar —
 * o que importa é a definição efetiva depois das duas. Os testes de conteúdo
 * passam a olhar o conjunto; a ORDEM tem teste próprio, mais abaixo.
 */
const sqlRc2 = () => `${ler(join(DIR, MIG_B))}\n${ler(join(DIR, MIG_C))}`;
const sqlC = () => ler(join(DIR, MIG_C));
const todoSql = () =>
  readdirSync(join(RAIZ, DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ler(join(DIR, f)))
    .join("\n");

/* ================================================================== *
 * RC2-B — SOS comunitário
 * ================================================================== */

test("B: o SOS não é reimplementado — sos_open, sos_cancel e sos_resolve não são tocados", () => {
  const sql = sqlB();
  for (const fn of ["sos_open", "sos_cancel", "sos_resolve"]) {
    assert.ok(
      !new RegExp(`FUNCTION\\s+public\\.${fn}\\s*\\(`, "i").test(sql),
      `a migration B não pode redefinir ${fn} — ele foi validado fisicamente`,
    );
  }
});

test("B: a idempotência mora no banco, num índice único", () => {
  const sql = sqlB();
  assert.ok(
    /CREATE UNIQUE INDEX[^;]*ux_community_alerts_sos_event[\s\S]*?WHERE sos_event_id IS NOT NULL/i.test(
      sql,
    ),
    "falta o índice único parcial que garante um alerta por SOS",
  );
  assert.ok(
    /ON CONFLICT \(sos_event_id\) WHERE sos_event_id IS NOT NULL DO NOTHING/i.test(sql),
    "o INSERT precisa se apoiar no índice parcial",
  );
});

test("B: a sincronização é do banco, por trigger, e não do frontend", () => {
  const sql = sqlB();
  assert.ok(/CREATE TRIGGER trg_sos_sync_community_alert/i.test(sql));
  assert.ok(/AFTER INSERT OR UPDATE OF status ON public\.sos_events/i.test(sql));
  assert.ok(/FUNCTION public\.sos_sync_community_alert/i.test(sql));
});

test("B: cancelar e resolver derrubam o alerta — nada de SOS fantasma", () => {
  const sql = sqlB();
  assert.ok(/WHEN NEW\.status = 'cancelled' THEN 'cancelled'/i.test(sql));
  assert.ok(/WHEN NEW\.status IN \('resolved','notified'\) THEN 'resolved'/i.test(sql));
  assert.ok(/ELSE 'expired'/i.test(sql), "qualquer outro status final precisa encerrar o alerta");
  assert.ok(/a\.status = 'active'/i.test(sql), "nearby_alerts só pode devolver alerta ativo");
});

test("B: o cliente não cria nem apaga alerta de SOS", () => {
  const sql = sqlB();
  assert.ok(
    /WITH CHECK \(auth\.uid\(\) = user_id AND type <> 'sos' AND sos_event_id IS NULL\)/i.test(sql),
  );
  assert.ok(/FOR DELETE TO authenticated[\s\S]{0,120}sos_event_id IS NULL/i.test(sql));
});

test("B: o tipo sos entra sem derrubar os quatro existentes", () => {
  const sql = sqlB();
  assert.ok(/CHECK \(type IN \('perigo','acidente','bloqueio','roubo','sos'\)\)/i.test(sql));
});

test("B: nearby_alerts não vaza nome completo, telefone nem e-mail", () => {
  const sql = sqlB();
  const corpo = corpoDeFuncao(sql, "nearby_alerts");
  assert.ok(
    /split_part\(COALESCE\(p\.name,''\), ' ', 1\)/i.test(corpo),
    "precisa expor só o primeiro nome",
  );
  assert.ok(!/p\.phone/i.test(corpo), "telefone não pode sair da RPC");
  assert.ok(!/p\.email/i.test(corpo), "e-mail não pode sair da RPC");
});

test("B: a migration é aditiva", () => {
  const sql = sqlB().toUpperCase();
  assert.ok(!sql.includes("DROP TABLE"));
  assert.ok(!sql.includes("DROP COLUMN"));
  assert.ok(!sql.includes("TRUNCATE"));
  // DELETE existe, e só pode existir dentro da função de retenção: apagar
  // presença vencida é o trabalho dela. Fora dali, seria destrutivo.
  const deletes = [...sqlB().matchAll(/DELETE FROM/gi)];
  const dentroDoPurge = sqlB().slice(
    sqlB().indexOf("FUNCTION public.purge_stale_presence"),
    sqlB().indexOf("GRANT EXECUTE ON FUNCTION public.purge_stale_presence"),
  );
  assert.equal(deletes.length, 1, "só a retenção pode apagar linhas");
  assert.ok(/DELETE FROM public\.live_locations/i.test(dentroDoPurge));
});

test("B: o frontend reconhece o tipo sos sem poder publicá-lo", () => {
  const hook = ler("src/hooks/useAlerts.ts");
  assert.ok(/export type AlertKind = AlertType \| "sos"/.test(hook));
  assert.ok(/sos: "SOS ativo"/.test(hook), "falta o rótulo do SOS");
  assert.ok(
    /export type AlertType = "perigo" \| "acidente" \| "bloqueio" \| "roubo";/.test(hook),
    "o tipo publicável não pode incluir sos",
  );
  const tela = ler("src/routes/_authenticated/alerts.tsx");
  assert.ok(!/key: "sos"/.test(tela), "a tela não pode oferecer sos no formulário");
});

/* ================================================================== *
 * RC2-C — riders com opt-in
 * ================================================================== */

test("C: o opt-in é explícito e nasce desligado", () => {
  const sql = sqlC();
  assert.ok(
    /ADD COLUMN IF NOT EXISTS share_with_riders boolean NOT NULL DEFAULT false/i.test(sql),
    "o default precisa ser false",
  );
});

const corpoDe = (nome: string) => corpoDeFuncao(sqlRc2(), nome);

/**
 * Matriz de visibilidade exigida na auditoria P0.3-C.
 *
 *   sharing ON  + opt-in OFF -> não retorna
 *   sharing ON  + opt-in ON  -> retorna
 *   sharing OFF + opt-in ON  -> não retorna
 *   self, posição vencida, fora do raio -> não retorna
 *   e-mail/telefone -> nunca
 */
test("C1/C3: online_riders exige o interruptor mestre de compartilhamento", () => {
  assert.ok(/l\.sharing = true/i.test(corpoDe("online_riders")));
});

test("C1/C2: a camada comunitária exige opt-in, sem exceção de contato", () => {
  const corpo = corpoDe("online_riders");
  assert.ok(
    /AND\s+p\.share_with_riders = true/i.test(corpo),
    "o opt-in precisa ser condição obrigatória",
  );
  assert.ok(
    !/is_trusted_contact/i.test(corpo),
    "contato autorizado NÃO pode furar o opt-in da camada comunitária",
  );
  assert.ok(!/\bOR\b/i.test(corpo), "nenhum OR pode abrir uma segunda porta de visibilidade");
  assert.ok(
    /JOIN public\.profiles/i.test(corpo) && !/LEFT JOIN public\.profiles/i.test(corpo),
    "com LEFT JOIN um perfil ausente escaparia do filtro de opt-in",
  );
});

test("C4: online_riders nunca devolve o próprio usuário", () => {
  assert.ok(/l\.user_id <> auth\.uid\(\)/i.test(corpoDe("online_riders")));
  assert.ok(/auth\.uid\(\) IS NOT NULL/i.test(corpoDe("online_riders")));
});

test("C5: posição vencida não aparece", () => {
  // O TTL agora vem do teto do servidor (P0.4-B), não do valor cru do cliente.
  assert.ok(
    /l\.updated_at > now\(\) - \(lim\.minutos \|\| ' minutes'\)/i.test(corpoDe("online_riders")),
  );
});

test("C6: fora do raio não aparece", () => {
  assert.ok(/<= lim\.radius_km/i.test(corpoDe("online_riders")));
});

test("C7: nenhuma das duas RPCs devolve e-mail ou telefone", () => {
  for (const fn of ["online_riders", "trusted_contacts_online"]) {
    const corpo = corpoDe(fn);
    for (const proibido of ["p\\.phone", "p\\.email", "l\\.phone", "document", "token"]) {
      assert.ok(!new RegExp(proibido, "i").test(corpo), `${fn} não pode devolver ${proibido}`);
    }
    assert.ok(
      /split_part\(COALESCE\(p\.name,''\), ' ', 1\)/i.test(corpo),
      `${fn} deve expor só o primeiro nome`,
    );
  }
});

test("C: o contato autorizado continua funcionando, em função separada", () => {
  const corpo = corpoDe("trusted_contacts_online");
  assert.ok(/is_trusted_contact/i.test(corpo), "a relação privada precisa continuar existindo");
  assert.ok(
    !/share_with_riders/i.test(corpo),
    "a relação privada não pode depender do opt-in comunitário",
  );
  assert.ok(/l\.sharing = true/i.test(corpo), "o interruptor mestre vale para os dois caminhos");
  assert.ok(/l\.user_id <> auth\.uid\(\)/i.test(corpo));
});

test("C: a UI consome as duas fontes, sem misturar as regras", () => {
  const hook = ler("src/hooks/useNearbyRiders.ts");
  assert.ok(/rpc\("trusted_contacts_online"/.test(hook));
  assert.ok(/rpc\("online_riders"/.test(hook));
  const mapa = ler("src/routes/_authenticated/map.tsx");
  assert.ok(mapa.includes("useNearbyRiders"), "o mapa precisa usar o hook que separa as fontes");
  const canais = (hook.match(/\.channel\(/g) ?? []).length;
  assert.equal(canais, 1, "duas listas não podem abrir duas assinaturas de realtime");
});

/* ================================================================== *
 * RC2-D — o gate de localização
 * ================================================================== */

test("D: nenhuma rota guarda a permissão em useState local", () => {
  for (const arquivo of [
    "src/routes/_authenticated/dashboard.tsx",
    "src/routes/_authenticated/map.tsx",
  ]) {
    const src = ler(arquivo);
    assert.ok(
      !/useState\(false\)[\s\S]{0,40}(granted|permission)/i.test(src),
      `${arquivo} ainda guarda a permissão em estado local`,
    );
    assert.ok(
      src.includes("useLocationPermission"),
      `${arquivo} precisa usar o estado compartilhado`,
    );
  }
});

test("D: o gate consulta a plataforma, não a memória do componente", () => {
  const gate = ler("src/components/LocationPermissionGate.tsx");
  assert.ok(gate.includes("useLocationPermission"));
  assert.ok(gate.includes("abrirConfiguracoesDoApp"), "falta o caminho de Abrir configurações");
  const lib = ler("src/lib/location-permission.ts");
  assert.ok(/checkPermissions/.test(lib), "falta consultar o plugin nativo");
  assert.ok(/permissions[\s\S]{0,40}query/.test(lib), "falta a Permissions API do navegador");
  assert.ok(
    /visibilitychange/.test(ler("src/hooks/useLocationPermission.ts")),
    "falta reconsultar ao voltar",
  );
});

/* ================================================================== *
 * Disciplina de migrations
 * ================================================================== */

test("as migrations do RC2 são novas e não duplicam o P0.2", () => {
  const arquivos = readdirSync(join(RAIZ, DIR)).filter((f) => f.endsWith(".sql"));
  assert.ok(arquivos.includes(MIG_B));
  assert.ok(arquivos.includes(MIG_C));
  assert.ok(
    !arquivos.includes("20260810230000_sos_p02_ambiguidade_coluna.sql"),
    "a migration redundante do P0.2 não pode voltar",
  );
  const p02 = arquivos.filter((f) => /ambiguidade/i.test(f));
  assert.equal(p02.length, 1, "só pode existir uma migration de ambiguidade");
});

test("nenhuma migration nova desabilita RLS ou expõe service_role", () => {
  const sql = todoSql().toUpperCase();
  assert.ok(!sql.includes("DISABLE ROW LEVEL SECURITY"));
  assert.ok(!/GRANT[^;]*TO ANON/.test(sqlB().toUpperCase() + sqlC().toUpperCase()));
});

/* ================================================================== *
 * P0.3-E — a ponte precisa estar LIGADA, não só existir
 * ================================================================== */

const TELAS_COM_NAVEGACAO = [
  "src/components/RealMap.tsx",
  "src/routes/_authenticated/map.tsx",
  "src/routes/_authenticated/alerts.tsx",
];

test("E1: a ponte central é realmente usada por código de produção", () => {
  const usuarios = TELAS_COM_NAVEGACAO.filter((f) =>
    /abrirNavegacaoExterna|abrirPontoExterno/.test(ler(f)),
  );
  assert.ok(
    usuarios.length >= 3,
    `a ponte precisa estar ligada nas telas de navegação; hoje só em: ${usuarios.join(", ") || "nenhuma"}`,
  );
  for (const arquivo of TELAS_COM_NAVEGACAO) {
    assert.ok(
      ler(arquivo).includes('from "@/lib/external-navigation"'),
      `${arquivo} não importa a ponte central`,
    );
  }
});

test("E2/E3: nenhuma tela abre mapa externo por fora da ponte", () => {
  for (const arquivo of TELAS_COM_NAVEGACAO) {
    const src = ler(arquivo);
    // Abrir mapa por conta própria: window.open, location.href ou âncora com
    // URL de mapa. Link de texto para compartilhar continua permitido.
    const aberturasCruas =
      src.match(/window\.open\([^)]*google\.com\/maps[\s\S]{0,120}?\)/g) ??
      src.match(/window\.open\(\s*\n?\s*(url|`https:\/\/www\.google)/g) ??
      [];
    assert.deepEqual(aberturasCruas, [], `${arquivo} ainda abre o Google Maps por conta própria`);
    assert.ok(
      !/location\.href\s*=\s*[`"']https:\/\/www\.google\.com\/maps/.test(src),
      `${arquivo} navega a própria WebView para o Google Maps`,
    );
    assert.ok(
      !/<a[^>]*href=\{?[`"']?https:\/\/www\.google\.com\/maps/.test(src),
      `${arquivo} usa âncora para o Google Maps — em WebView isso vira intent://`,
    );
  }
});

test("E: a ponte nativa é a que o projeto já tem, sem arquitetura paralela", () => {
  const nav = ler("src/lib/external-navigation.ts");
  const perm = ler("src/lib/location-permission.ts");
  for (const [nome, src] of [
    ["external-navigation", nav],
    ["location-permission", perm],
  ] as const) {
    assert.ok(
      /import \{ isNativeApp \} from "\.\/native\.ts"/.test(src),
      `${nome} precisa usar o detector de native.ts`,
    );
    assert.ok(
      !/window\.Capacitor\?\.\w+\?\.\(\)|Capacitor\?\.isNativePlatform/.test(src),
      `${nome} não pode redetectar a plataforma por conta própria`,
    );
  }
  assert.ok(/import\("@capacitor\/browser"\)/.test(nav), "usar o plugin já instalado");
  assert.ok(/import\("@capacitor\/geolocation"\)/.test(perm), "usar o plugin já instalado");
});

test("E: o helper nunca constrói esquema proprietário", () => {
  const nav = ler("src/lib/external-navigation.ts");
  // As funções que montam URL só podem produzir https. Menções a intent:// no
  // arquivo são a lista de esquemas RECUSADOS e os comentários que explicam o
  // bug — por isso o teste olha as construtoras, não o arquivo inteiro.
  const construtoras = nav.slice(nav.indexOf("export function urlDeNavegacao"));
  for (const proibido of ["intent://", "geo:", "google.navigation:", "waze://"]) {
    assert.ok(
      !construtoras.includes(`\`${proibido}`) && !construtoras.includes(`"${proibido}`),
      `nenhuma URL pode ser montada com ${proibido}`,
    );
  }
  assert.ok(/https:\/\/www\.google\.com\/maps\/dir\/\?api=1/.test(construtoras));
  assert.ok(/https:\/\/www\.waze\.com\/ul/.test(construtoras));
});

/* ================================================================== *
 * P0.4-A — o SOS não pode vazar por SELECT direto
 * ================================================================== */

test("P0.4-A.1: a policy USING (true) é substituída, não mantida", () => {
  const sql = sqlB();
  assert.ok(
    /DROP POLICY IF EXISTS "alerts readable by authenticated" ON public\.community_alerts/i.test(
      sql,
    ),
    "a policy aberta precisa ser derrubada nesta migration",
  );
  const nova = /CREATE POLICY "alerts select scoped"[\s\S]*?USING \(([\s\S]*?)\);/i.exec(sql);
  assert.ok(nova, "falta a policy de SELECT nova");
  const condicao = nova[1].replace(/\s+/g, " ").trim();
  assert.notEqual(condicao, "true", "SELECT não pode voltar a ser irrestrito");
  assert.ok(
    /sos_event_id IS NULL/i.test(condicao) && /auth\.uid\(\) = user_id/i.test(condicao),
    "o SOS de terceiros precisa ficar fora do SELECT direto",
  );
});

test("P0.4-A.1: nenhuma migration deixa community_alerts com SELECT aberto no fim", () => {
  // A definição EFETIVA é a última que roda. Uma policy aberta criada depois
  // anularia a correção.
  const arquivos = readdirSync(join(RAIZ, DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let ultimaAberta = -1;
  let ultimaFechada = -1;
  arquivos.forEach((f, i) => {
    const sql = semComentarios(ler(join(DIR, f)));
    if (/CREATE POLICY[^;]*community_alerts[^;]*FOR SELECT[^;]*USING \(\s*true\s*\)/i.test(sql)) {
      ultimaAberta = i;
    }
    if (/CREATE POLICY "alerts select scoped"/i.test(sql)) ultimaFechada = i;
  });
  assert.ok(
    ultimaFechada > ultimaAberta,
    "a policy restritiva precisa ser a última a valer para community_alerts",
  );
});

test("P0.4-A.2: alertas manuais continuam legíveis, criáveis e removíveis", () => {
  const sql = sqlB();
  const condicao = /CREATE POLICY "alerts select scoped"[\s\S]*?USING \(([\s\S]*?)\);/i.exec(
    sql,
  )![1];
  assert.ok(
    /sos_event_id IS NULL/i.test(condicao),
    "alerta manual (sem sos_event_id) precisa continuar visível para a comunidade",
  );
  assert.ok(/FOR INSERT TO authenticated/i.test(sql), "criação de alerta manual não pode sumir");
  assert.ok(/FOR DELETE TO authenticated/i.test(sql), "remoção do próprio alerta não pode sumir");

  // O cliente não pode ter passado a ler a tabela direto por causa da RLS.
  const hook = ler("src/hooks/useAlerts.ts");
  assert.ok(
    !/from\("community_alerts"\)[\s\S]{0,40}\.select\(/.test(hook),
    "a leitura precisa continuar passando só por nearby_alerts()",
  );
  assert.ok(/rpc\("nearby_alerts"/.test(hook));
});

test("P0.4-A: o fallback do Realtime é refetch, não SELECT aberto", () => {
  const hook = ler("src/hooks/useAlerts.ts");
  assert.ok(/refetchInterval:\s*\d+_?\d*/.test(hook), "falta o refresh periódico da RPC segura");
  assert.ok(
    /refetchIntervalInBackground:\s*false/.test(hook),
    "não pode ficar consultando com o app em segundo plano",
  );
  // O canal só invalida: o callback não pode receber payload de linha.
  assert.ok(
    /table: "community_alerts" \},\s*\(\)\s*=>\s*\{/.test(hook),
    "o callback do canal precisa ser () => {} — nenhum payload de linha entra na UI",
  );
});

/* ================================================================== *
 * P0.4-B — os limites vivem no SQL, não na interface
 * ================================================================== */

const TETOS = [
  { fn: "nearby_alerts", sql: sqlRc2, raio: 50, tempo: 24, unidade: "horas" },
  { fn: "online_riders", sql: sqlRc2, raio: 50, tempo: 15, unidade: "minutos" },
  { fn: "trusted_contacts_online", sql: sqlRc2, raio: 100, tempo: 30, unidade: "minutos" },
] as const;

test("P0.4-B.3/5: todas as RPCs impõem raio máximo no servidor", () => {
  for (const { fn, sql, raio } of TETOS) {
    const corpo = corpoDeFuncao(sql(), fn);
    assert.ok(
      new RegExp(
        `LEAST\\(GREATEST\\(COALESCE\\(_radius_km[^)]*\\)[^)]*\\),\\s*${raio}\\)`,
        "i",
      ).test(corpo),
      `${fn} precisa limitar o raio a ${raio} km no SQL`,
    );
    assert.ok(
      !/<= GREATEST\(_radius_km, 1\)/.test(corpo),
      `${fn} ainda aceita o raio cru do cliente`,
    );
  }
});

test("P0.4-B.4/6/7: todas as RPCs impõem teto de tempo no servidor", () => {
  for (const { fn, sql, tempo, unidade } of TETOS) {
    const corpo = corpoDeFuncao(sql(), fn);
    const param = unidade === "horas" ? "_hours" : "_minutes";
    assert.ok(
      new RegExp(
        `LEAST\\(GREATEST\\(COALESCE\\(${param}[^)]*\\)[^)]*\\),\\s*${tempo}\\)`,
        "i",
      ).test(corpo),
      `${fn} precisa limitar ${param} a ${tempo}`,
    );
    assert.ok(
      !new RegExp(`\\(GREATEST\\(${param},1\\) \\|\\|`).test(corpo),
      `${fn} ainda aceita o TTL cru do cliente`,
    );
  }
});

test("P0.4-B: origem inválida ou Null Island devolve lista vazia", () => {
  // Este teste conferia a validação de `_lat`/`_lng`. Isso deixou de fazer
  // sentido no P0.5-A: os parâmetros do cliente não decidem mais a origem, e
  // validá-los seria teatro. O que precisa ser válido é a POSIÇÃO DA CONTA.
  //
  // Ele só continuava passando porque havia uma definição morta de
  // nearby_alerts na mesma migration, e `corpoDeFuncao` pegava a primeira. A
  // reordenação removeu a duplicata e a verdade apareceu.
  for (const { fn, sql } of TETOS) {
    const corpo = corpoEfetivo(sql(), fn);
    assert.ok(/me\.lat BETWEEN -90 AND 90/i.test(corpo), `${fn}: falta validar a origem`);
    assert.ok(/me\.lng BETWEEN -180 AND 180/i.test(corpo), `${fn}: falta validar a origem`);
    assert.ok(/NOT \(me\.lat = 0 AND me\.lng = 0\)/i.test(corpo), `${fn}: Null Island como origem`);
    assert.ok(/CROSS JOIN eu/i.test(corpo), `${fn}: origem precisa ser obrigatória`);
  }
});

test("P0.4-B: o contrato que a interface usa hoje continua valendo", () => {
  // A UI pede 25 km / 24 h em alertas e 50 km / 10 min em riders. Se algum
  // teto ficar abaixo disso, a correção teria quebrado o produto.
  const usoAlertas = ler("src/hooks/useAlerts.ts");
  assert.ok(/_radius_km: radiusKm/.test(usoAlertas) && /_hours: 24/.test(usoAlertas));
  const usoRiders = ler("src/hooks/useNearbyRiders.ts");
  assert.ok(/_minutes: 10/.test(usoRiders));
  for (const { fn, tempo, unidade } of TETOS) {
    if (unidade === "horas") assert.ok(tempo >= 24, `${fn}: teto abaixo do que a UI pede`);
    else assert.ok(tempo >= 10, `${fn}: teto abaixo do que a UI pede`);
  }
});

/* ================================================================== *
 * P0.4-C — o toggle precisa mandar de verdade
 * ================================================================== */

test("P0.4-C.8/9: o hook não liga a comunidade por conta própria", () => {
  const hook = ler("src/hooks/useNearbyRiders.ts");
  assert.ok(
    !/comunidade:\s*verComunidade\s*=\s*true|comunidade\?\s*:\s*boolean\s*}\s*=\s*\{\s*\}/.test(
      hook,
    ),
    "nenhum default implícito de camada ligada",
  );
  assert.ok(/consultasHabilitadas\(camadas, !!pos\)/.test(hook), "a decisão vem das camadas");
  assert.ok(
    /enabled: verComunidade/.test(hook) && /enabled: verContatos/.test(hook),
    "camada desligada precisa desabilitar a query, não só esconder o pino",
  );
});

test("P0.4-C: o mapa tem o controle e passa a preferência ao hook", () => {
  const mapa = ler("src/routes/_authenticated/map.tsx");
  assert.ok(/useMapLayers\(\)/.test(mapa), "falta o hook de camadas");
  assert.ok(
    /useNearbyRiders\(position, 50, camadas\)/.test(mapa),
    "a preferência precisa chegar ao hook",
  );
  assert.ok(/alternar\("comunidade"\)/.test(mapa), "falta o botão que alterna a camada");
  assert.ok(/role="switch"/.test(mapa) && /aria-checked=\{camadas\.comunidade\}/.test(mapa));
  assert.ok(/Outros motoqueiros/.test(mapa), "falta o rótulo do controle");
});

test("P0.4-C: o controle de VER é separado do de APARECER", () => {
  const mapa = ler("src/routes/_authenticated/map.tsx");
  assert.ok(
    !/share_with_riders/.test(mapa),
    "o mapa não pode mexer na privacidade do servidor; ele só decide o que desenha",
  );
  const sharing = ler("src/routes/_authenticated/sharing.tsx");
  assert.ok(/useRiderVisibility/.test(sharing), "APARECER continua na tela de Compartilhamento");
});

/* ================================================================== *
 * O andaime não pode virar arquitetura
 * ================================================================== */

test("o andaime db-novo foi removido: ninguém mais o importa", () => {
  assert.ok(
    !existsSync(join(RAIZ, "src/lib/db-novo.ts")),
    "db-novo.ts deveria ter sumido depois que os tipos do Supabase foram regerados",
  );
  const chamadores = [
    "src/hooks/useRiderVisibility.ts",
    "src/hooks/useNearbyRiders.ts",
    "src/hooks/useLiveShare.ts",
    "src/lib/presence.ts",
  ].filter((f) => /db-novo/.test(ler(f)));
  assert.deepEqual(chamadores, [], "ainda há import da ponte removida");
});

/* ================================================================== *
 * P0.5-A — a origem de proximidade não é spoofável
 * ================================================================== */

const RPCS_DE_PROXIMIDADE = [
  { fn: "nearby_alerts", sql: sqlRc2 },
  { fn: "online_riders", sql: sqlRc2 },
  { fn: "trusted_contacts_online", sql: sqlRc2 },
] as const;

/** A definição EFETIVA é a última que a migration declara. */
function corpoEfetivo(sql: string, nome: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION\\s+public\\.${nome}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    "gi",
  );
  const todos = [...sql.matchAll(re)].map((m) => m[1]);
  assert.ok(todos.length > 0, `corpo de ${nome} não encontrado`);
  return todos[todos.length - 1];
}

test("P0.5-A.1/7: grid scan não funciona — a origem vem do servidor", () => {
  for (const { fn, sql } of RPCS_DE_PROXIMIDADE) {
    const corpo = corpoEfetivo(sql(), fn);
    assert.ok(
      /WITH eu AS \([\s\S]*?FROM public\.live_locations me[\s\S]*?me\.user_id = auth\.uid\(\)/i.test(
        corpo,
      ),
      `${fn}: a origem precisa ser a posição do próprio viewer`,
    );
    // O parâmetro do cliente não pode mais aparecer no cálculo de distância.
    const distancia = corpo.slice(corpo.indexOf("6371"));
    assert.ok(
      !/radians\(_lat\)|radians\(_lng\)/.test(distancia),
      `${fn}: o centro ainda vem do parâmetro do cliente`,
    );
    assert.ok(/radians\(eu\.lat\)/.test(distancia), `${fn}: falta usar eu.lat como origem`);
  }
});

test("P0.5-A.2/3: origem precisa ser recente, válida e fora de Null Island", () => {
  for (const { fn, sql } of RPCS_DE_PROXIMIDADE) {
    const eu = /WITH eu AS \(([\s\S]*?)\)\s*,\s*lim/i.exec(corpoEfetivo(sql(), fn))?.[1] ?? "";
    assert.ok(eu.length > 0, `${fn}: bloco de origem não encontrado`);
    assert.ok(
      /updated_at > now\(\) - interval '\d+ minutes'/i.test(eu),
      `${fn}: falta TTL da origem`,
    );
    assert.ok(/me\.lat BETWEEN -90 AND 90/i.test(eu), `${fn}: falta validar a origem`);
    assert.ok(/NOT \(me\.lat = 0 AND me\.lng = 0\)/i.test(eu), `${fn}: Null Island como origem`);
    // CROSS JOIN com bloco vazio = zero linhas: sem posição recente, nada sai.
    assert.ok(
      /CROSS JOIN eu/i.test(corpoEfetivo(sql(), fn)),
      `${fn}: origem precisa ser obrigatória`,
    );
  }
});

test("P0.5-A.4/5 e P0.6.7/8: atualizar posição não mexe no sharing", () => {
  const corpo = corpoEfetivo(sqlRc2(), "presence_touch");
  const doUpdate =
    /UPDATE public\.live_locations ll([\s\S]*?)WHERE ll\.user_id = v_uid;/i.exec(corpo)?.[1] ?? "";
  assert.ok(doUpdate.length > 0, "bloco de atualização não encontrado");
  assert.ok(
    !/\bsharing\s*=/i.test(doUpdate),
    "atualizar posição não pode alterar sharing, em nenhuma direção",
  );
  assert.ok(/lat = _lat/i.test(doUpdate), "a posição precisa ser atualizada");
});

test("P0.5-A.6: a primeira linha de presença nunca nasce publicada", () => {
  const corpo = corpoEfetivo(sqlRc2(), "presence_touch");
  const insert = corpo.slice(corpo.indexOf("INSERT INTO"), corpo.indexOf("ON CONFLICT"));
  assert.ok(/false,\s*--\s*primeira linha NUNCA nasce publicada/i.test(insert));
  assert.ok(
    /ALTER TABLE public\.live_locations ALTER COLUMN sharing SET DEFAULT false/i.test(sqlRc2()),
    "o default da coluna também precisa ser false, como segunda trava",
  );
});

test("P0.5-A: presence_touch escreve só a própria linha e valida entrada", () => {
  const corpo = corpoEfetivo(sqlRc2(), "presence_touch");
  assert.ok(
    /v_uid\s+uuid\s*:=\s*auth\.uid\(\)/i.test(corpo),
    "falta derivar o usuário de auth.uid()",
  );
  assert.ok(
    /IF v_uid IS NULL THEN[\s\S]*?RAISE EXCEPTION/i.test(corpo),
    "falta exigir autenticação",
  );
  assert.ok(/_lat BETWEEN -90 AND 90/i.test(corpo) && /_lat = 0 AND _lng = 0/i.test(corpo));
  const assinatura =
    /CREATE OR REPLACE FUNCTION\s+public\.presence_touch\s*\(([\s\S]*?)\)\s*RETURNS/i.exec(
      sqlRc2(),
    )?.[1] ?? "";
  assert.ok(!/user_id|uuid/i.test(assinatura), "a função não pode aceitar user_id por parâmetro");
  assert.ok(/SECURITY DEFINER/i.test(sqlRc2()) && /SET search_path = public/i.test(sqlRc2()));
});

test("P0.5-A: o cliente registra presença antes de consultar proximidade", () => {
  for (const arquivo of ["src/hooks/useAlerts.ts", "src/hooks/useNearbyRiders.ts"]) {
    const src = ler(arquivo);
    assert.ok(/registrarPresenca\(pos\)/.test(src), `${arquivo} não registra presença`);
  }
  const presenca = ler("src/lib/presence.ts");
  assert.ok(/rpc\("presence_touch"/.test(presenca));
  assert.ok(/sharing/i.test(presenca), "o módulo precisa documentar que não mexe em sharing");
});

/* ================================================================== *
 * P0.5-B — a Home usa a mesma fonte de verdade
 * ================================================================== */

const TELAS_DE_MAPA = [
  "src/routes/_authenticated/dashboard.tsx",
  "src/routes/_authenticated/map.tsx",
];

test("P0.5-B.1/6: nenhuma tela de mapa usa useOnlineRiders direto", () => {
  for (const arquivo of TELAS_DE_MAPA) {
    const src = ler(arquivo);
    assert.ok(
      !/useOnlineRiders/.test(src),
      `${arquivo} voltou a usar o hook antigo e fura opt-in, toggle e separação`,
    );
    assert.ok(/useNearbyRiders/.test(src), `${arquivo} precisa usar a fonte única`);
  }
});

test("P0.5-B.2/8: Home e /map compartilham a mesma preferência", () => {
  for (const arquivo of TELAS_DE_MAPA) {
    const src = ler(arquivo);
    assert.ok(/useMapLayers\(\)/.test(src), `${arquivo} não lê a preferência compartilhada`);
    assert.ok(
      /useNearbyRiders\(position, 50, camadas\)/.test(src),
      `${arquivo} não repassa a preferência ao hook`,
    );
  }
  // Uma chave só: dois storages seriam dois estados incompatíveis.
  const lib = ler("src/lib/map-layers.ts");
  const chaves = lib.match(/const CHAVE_CAMADAS = "[^"]+"/g) ?? [];
  assert.equal(chaves.length, 1, "só pode existir uma chave de persistência");
  for (const arquivo of TELAS_DE_MAPA) {
    assert.ok(!/localStorage/.test(ler(arquivo)), `${arquivo} não pode ter persistência própria`);
  }
});

test("P0.5-B.3/4/5: o toggle da Home controla a comunidade e poupa os contatos", () => {
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.ok(/alternar\("comunidade"\)/.test(home), "falta o controle na Home");
  assert.ok(/label="Outros motoqueiros"/.test(home), "o controle precisa entrar no LayerToggle");
  assert.ok(
    !/alternar\("contatos"\)/.test(home),
    "contatos autorizados não podem depender do toggle da comunidade",
  );
  // A decisão de habilitar a query continua concentrada no hook.
  assert.ok(/consultasHabilitadas\(camadas, !!pos\)/.test(ler("src/hooks/useNearbyRiders.ts")));
});

/* ================================================================== *
 * P0.5-C — controles não podem ocupar a mesma coordenada
 * ================================================================== */

test("P0.5-C.7: nenhum par de controles absolutos divide a mesma posição", () => {
  for (const arquivo of TELAS_DE_MAPA) {
    const src = semComentariosTs(ler(arquivo));
    // Posições absolutas declaradas em elementos (não em containers de layout).
    const posicoes = [...src.matchAll(/absolute\s+(right-\d+)\s+(top-(?:\d+|\[[^\]]+\]))/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    const repetidas = posicoes.filter((p, i) => posicoes.indexOf(p) !== i);
    assert.deepEqual(
      [...new Set(repetidas)],
      [],
      `${arquivo}: controles empilhados na mesma coordenada — o de baixo fica inalcançável`,
    );
  }
});

test("P0.5-C: os dois controles do mapa vivem no mesmo container empilhado", () => {
  const mapa = ler("src/routes/_authenticated/map.tsx");
  assert.ok(
    /absolute right-3 top-3 z-20 flex flex-col items-end gap-2/.test(mapa),
    "falta o container que empilha os controles",
  );
  const container = mapa.slice(mapa.indexOf("absolute right-3 top-3 z-20"));
  assert.ok(/Outros motoqueiros/.test(container) && /"Seguindo"/.test(container));
});

/* ================================================================== *
 * P0.6 — escrita direta fechada e controles de servidor
 *
 * Correção de linguagem, e ela importa: a v4 dizia que a origem era "não
 * spoofável". Era falso. RLS garante que a pessoa só escreve NA PRÓPRIA
 * linha; não garante que os valores sejam verdadeiros. GPS vem do aparelho e
 * nenhum servidor prova onde o telefone está sem attestation de plataforma.
 * O que estes testes cobrem é redução de varredura e abuso — não veracidade.
 * ================================================================== */

test("P0.6.1/2/3: authenticated perde INSERT, UPDATE e DELETE em live_locations", () => {
  const sql = semComentarios(sqlRc2());
  const revoke = /REVOKE\s+([A-Z, ]+?)\s+ON public\.live_locations\s+FROM\s+authenticated/i.exec(
    sql,
  );
  assert.ok(revoke, "falta revogar a escrita direta");
  const revogados = revoke[1].toUpperCase();
  for (const dml of ["INSERT", "UPDATE", "DELETE"]) {
    assert.ok(revogados.includes(dml), `${dml} continua liberado para authenticated`);
  }
  // A policy FOR ALL também some: intenção explícita, não só privilégio.
  assert.ok(
    /DROP POLICY IF EXISTS "live location own access" ON public\.live_locations/i.test(sql),
    "a policy FOR ALL precisa ser derrubada",
  );
  assert.ok(
    /CREATE POLICY "live location own select"[\s\S]*?FOR SELECT TO authenticated/i.test(sql),
    "a leitura da própria linha precisa continuar",
  );
});

test("P0.6.4: service_role continua com acesso", () => {
  const todas = readdirSync(join(RAIZ, DIR))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => semComentarios(ler(join(DIR, f))))
    .join("\n");
  assert.ok(
    /GRANT ALL ON public\.live_locations TO service_role/i.test(todas),
    "service_role precisa manter acesso",
  );
  assert.ok(
    !/REVOKE[^;]*ON public\.live_locations[^;]*FROM[^;]*service_role/i.test(
      semComentarios(sqlRc2()),
    ),
    "nada pode ter sido revogado de service_role",
  );
});

test("P0.6.5/6: nenhum arquivo de src/ faz DML direto em live_locations", () => {
  const arquivos: string[] = [];
  const varrer = (dir: string) => {
    for (const entrada of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
      const caminho = `${dir}/${entrada.name}`;
      if (entrada.isDirectory()) varrer(caminho);
      else if (/\.(ts|tsx)$/.test(entrada.name) && !entrada.name.includes(".test."))
        arquivos.push(caminho);
    }
  };
  varrer("src");

  const infratores: string[] = [];
  for (const arquivo of arquivos) {
    const src = semComentariosTs(ler(arquivo));
    for (const dml of ["insert", "upsert", "update", "delete"]) {
      const re = new RegExp(
        `from\\(\\s*["']live_locations["']\\s*\\)[\\s\\S]{0,120}?\\.${dml}\\(`,
        "i",
      );
      if (re.test(src)) infratores.push(`${arquivo}: .${dml}()`);
    }
  }
  assert.deepEqual(
    infratores,
    [],
    `escrita direta em live_locations precisa passar por RPC:\n${infratores.join("\n")}`,
  );

  // O hook de compartilhamento continua lendo a própria linha — isso é permitido.
  const hook = ler("src/hooks/useLiveShare.ts");
  assert.ok(/rpc\("set_location_sharing"/.test(hook), "ligar/desligar precisa ser por RPC");
  assert.ok(/publicarPresenca\(/.test(hook), "a posição precisa ir por presence_touch");
});

test("P0.6.10/11/12: set_location_sharing muda só sharing e só do próprio usuário", () => {
  const corpo = corpoEfetivo(sqlRc2(), "set_location_sharing");
  const assinatura =
    /CREATE OR REPLACE FUNCTION\s+public\.set_location_sharing\s*\(([\s\S]*?)\)\s*RETURNS/i.exec(
      sqlRc2(),
    )?.[1] ?? "";
  assert.ok(/_enabled boolean/i.test(assinatura), "precisa receber o estado desejado");
  assert.ok(!/user_id|uuid/i.test(assinatura), "não pode aceitar user_id");
  assert.ok(!/_lat|_lng/i.test(assinatura), "não pode aceitar coordenada");

  const doUpdate =
    /UPDATE public\.live_locations ll([\s\S]*?)WHERE ll\.user_id = v_uid;/i.exec(corpo)?.[1] ?? "";
  assert.ok(/sharing = _enabled/i.test(doUpdate), "precisa alterar sharing");
  assert.ok(!/\blat\s*=|\blng\s*=|updated_at\s*=/i.test(doUpdate), "não pode tocar na posição");
  assert.ok(/WHERE ll\.user_id = v_uid/i.test(corpo), "só a própria linha");
  assert.ok(/v_uid\s+uuid\s*:=\s*auth\.uid\(\)/i.test(corpo));
});

test("P0.6.13: intervalo mínimo entre atualizações vive no servidor", () => {
  const corpo = corpoEfetivo(sqlRc2(), "presence_touch");
  assert.ok(
    /INTERVALO_MIN\s+constant[\s\S]*?:=\s*\d+/i.test(corpo),
    "falta o intervalo mínimo no SQL",
  );
  assert.ok(
    /IF v_segundos < INTERVALO_MIN THEN[\s\S]*?RETURN 'throttled'/i.test(corpo),
    "chamada rápida demais precisa ser recusada pelo servidor",
  );
});

test("P0.6.14/15: salto impossível é recusado, movimento normal continua aceito", () => {
  const corpo = corpoEfetivo(sqlRc2(), "presence_touch");
  assert.ok(/VEL_MAX_KMH\s+constant[\s\S]*?:=\s*(\d+)/i.test(corpo), "falta o teto de velocidade");
  const teto = Number(/VEL_MAX_KMH\s+constant[\s\S]*?:=\s*(\d+)/i.exec(corpo)![1]);
  assert.ok(teto >= 300, `teto de ${teto} km/h é apertado demais: GPS ruim viraria bloqueio`);
  assert.ok(teto <= 800, `teto de ${teto} km/h não barra teleporte entre estados`);
  assert.ok(/IF v_kmh > VEL_MAX_KMH THEN[\s\S]*?RETURN 'rejected_jump'/i.test(corpo));
  // Margens que evitam falso positivo: ruído curto e app fechado por horas.
  assert.ok(/IF v_dist_km > 1 THEN/i.test(corpo), "ruído de GPS abaixo de 1 km não pode acusar");
  assert.ok(/v_segundos <= JANELA_MIN \* 60/i.test(corpo), "fora da janela não se compara nada");
});

test("P0.6: a primeira posição é declarada como vinda do cliente", () => {
  const corpo = corpoEfetivo(sqlRc2(), "presence_touch");
  assert.ok(
    /LIMITAÇÃO ASSUMIDA[\s\S]*?vem do\s*--\s*cliente|LIMITAÇÃO ASSUMIDA[\s\S]*?cliente/i.test(
      corpo,
    ),
    "a limitação da primeira posição precisa estar escrita no código",
  );
});

test("P0.6.18: nenhuma documentação chama a origem de não spoofável", () => {
  const docs = [
    "RC2-ANDROID-RELEASE-AUDIT.md",
    "RC2-ANDROID-ARCHITECTURE.md",
    "RC2-MIGRATIONS-FINAL.md",
  ];
  const proibidas = [
    /n[ãa]o\s+spoof[áa]vel/i,
    /n[ãa]o h[áa] o que falsificar/i,
    /imposs[íi]vel de abusar/i,
  ];
  for (const doc of docs) {
    // Citar a frase errada para corrigi-la é o oposto de prometê-la: linhas
    // entre aspas e blocos de citação ficam fora da varredura.
    const texto = ler(doc)
      .split("\n")
      .filter((linha) => !linha.trimStart().startsWith(">"))
      .join("\n")
      .replace(/\*"[^"]*"\*/g, " ")
      .replace(/"[^"\n]{0,200}"/g, " ");
    for (const frase of proibidas) {
      assert.ok(
        !frase.test(texto),
        `${doc} promete uma propriedade que o produto não tem: ${frase}`,
      );
    }
  }
  // O SQL também não pode prometer isso.
  for (const sql of [sqlB(), sqlC()]) {
    assert.ok(!/n[ãa]o spoof[áa]vel/i.test(sql));
  }
});

test("P0.6: existe política de retenção da presença privada", () => {
  const corpo = corpoEfetivo(sqlRc2(), "purge_stale_presence");
  assert.ok(/DELETE FROM public\.live_locations/i.test(corpo));
  assert.ok(
    /DELETE FROM public\.live_locations ll\s*WHERE ll\.sharing = false/i.test(
      corpo.replace(/\s+/g, " "),
    ),
    "só a presença privada vencida é apagada inteira",
  );
  assert.ok(
    /GRANT EXECUTE ON FUNCTION public\.purge_stale_presence\(integer\) TO service_role/i.test(
      sqlRc2(),
    ),
    "só service_role pode purgar",
  );
  assert.ok(
    !/GRANT EXECUTE ON FUNCTION public\.purge_stale_presence\(integer\) TO authenticated/i.test(
      sqlRc2(),
    ),
  );
  assert.ok(
    /reten[çc][ãa]o/i.test(ler("RC2-MIGRATIONS-FINAL.md")),
    "a política precisa estar documentada",
  );
});

/* ================================================================== *
 * ATOMICIDADE DAS MIGRATIONS
 *
 * A regra: se a 30 falhar, o estado deixado pela 29 sozinha precisa ser
 * seguro. Como a 29 é a que liga o SOS comunitário — o que publica posição
 * de terceiros — ela precisa endurecer a localização ANTES disso, no mesmo
 * arquivo.
 * ================================================================== */

test("ATOM.1: a migration 29 endurece a localização antes de ligar o SOS comunitário", () => {
  const sql = semComentarios(sqlB());
  const marcos = {
    defaultPrivado: sql.search(/ALTER COLUMN sharing SET DEFAULT false/i),
    escritaFechada: sql.search(/REVOKE INSERT, UPDATE, DELETE ON public\.live_locations/i),
    ownSelect: sql.search(/CREATE POLICY "live location own select"/i),
    presenceTouch: sql.search(/CREATE OR REPLACE FUNCTION public\.presence_touch/i),
    setSharing: sql.search(/CREATE OR REPLACE FUNCTION public\.set_location_sharing/i),
    trigger: sql.search(/CREATE TRIGGER trg_sos_sync_community_alert/i),
    nearbyAlerts: sql.search(/CREATE OR REPLACE FUNCTION public\.nearby_alerts/i),
  };
  for (const [nome, pos] of Object.entries(marcos)) {
    assert.ok(pos > -1, `a migration 29 precisa conter ${nome}`);
  }
  const ultimoDaParte1 = Math.max(
    marcos.defaultPrivado,
    marcos.escritaFechada,
    marcos.ownSelect,
    marcos.presenceTouch,
    marcos.setSharing,
  );
  assert.ok(
    ultimoDaParte1 < marcos.trigger,
    "o modelo de localização precisa estar fechado antes do trigger comunitário",
  );
  assert.ok(
    ultimoDaParte1 < marcos.nearbyAlerts,
    "nearby_alerts expõe posição de terceiros: só depois da PARTE 1",
  );
});

test("ATOM.2: a migration 30 não mexe no modelo de localização", () => {
  const sql = semComentarios(sqlC());
  assert.ok(!/ALTER TABLE public\.live_locations/i.test(sql));
  assert.ok(!/REVOKE[^;]*ON public\.live_locations/i.test(sql));
  assert.ok(!/POLICY[^;]*ON public\.live_locations/i.test(sql));
  for (const fn of ["presence_touch", "set_location_sharing", "purge_stale_presence"]) {
    assert.ok(
      !new RegExp(`CREATE OR REPLACE FUNCTION\\s+public\\.${fn}`, "i").test(sql),
      `${fn} pertence à migration 29, não à 30`,
    );
  }
  // Ler live_locations é o trabalho dela — isso continua.
  assert.ok(/FROM public\.live_locations/i.test(sql));
});

test("ATOM.3: nenhum objeto é definido duas vezes na mesma migration", () => {
  for (const [nome, sql] of [
    [MIG_B, sqlB()],
    [MIG_C, sqlC()],
  ] as const) {
    const definicoes = [...sql.matchAll(/CREATE OR REPLACE FUNCTION\s+public\.(\w+)\s*\(/gi)].map(
      (m) => m[1],
    );
    const repetidas = definicoes.filter((f, i) => definicoes.indexOf(f) !== i);
    assert.deepEqual(
      [...new Set(repetidas)],
      [],
      `${nome}: definição duplicada esconde qual versão vale e mascara testes`,
    );
  }
});

test("ATOM.4: a parte 1 sozinha já protege live_locations", () => {
  const sql = semComentarios(sqlB());
  const parte1 = sql.slice(0, sql.search(/CREATE TRIGGER trg_sos_sync_community_alert/i));
  for (const [nome, re] of [
    ["default privado", /ALTER COLUMN sharing SET DEFAULT false/i],
    [
      "escrita fechada",
      /REVOKE INSERT, UPDATE, DELETE ON public\.live_locations FROM authenticated/i,
    ],
    ["rate limit", /RETURN 'throttled'/i],
    ["anti-teleporte", /RETURN 'rejected_jump'/i],
    ["retenção", /FUNCTION public\.purge_stale_presence/i],
    ["grant de presença", /GRANT EXECUTE ON FUNCTION public\.presence_touch[^;]*TO authenticated/i],
  ] as const) {
    assert.ok(re.test(parte1), `a parte 1 precisa conter: ${nome}`);
  }
});

test("RETENÇÃO: coordenada vencida não fica guardada por causa de um booleano", () => {
  const corpo = corpoEfetivo(sqlRc2(), "purge_stale_presence");
  assert.ok(
    /DELETE FROM public\.live_locations/i.test(corpo),
    "presença privada vencida é apagada",
  );
  assert.ok(/ll\.sharing = false/i.test(corpo));
  // O ponto novo: com sharing ligado, a coordenada vencida é descartada e a
  // preferência fica. Preferência se guarda com booleano, não com posição.
  const update =
    /UPDATE public\.live_locations ll([\s\S]*?)GET DIAGNOSTICS v_anonimizadas/i.exec(corpo)?.[1] ??
    "";
  assert.ok(update.length > 0, "falta a minimização das linhas com sharing ligado");
  // A verificação precisa separar SET de WHERE: filtrar POR sharing é o que
  // se quer; ESCREVER em sharing é o que não pode. Olhar o bloco inteiro de
  // uma vez torna a asserção impossível de satisfazer.
  const setClause = /SET([\s\S]*?)WHERE/i.exec(update)?.[1] ?? "";
  const whereClause = /WHERE([\s\S]*)$/i.exec(update)?.[1] ?? "";
  assert.ok(
    /lat = 0/i.test(setClause) && /lng = 0/i.test(setClause),
    "a coordenada precisa ser descartada",
  );
  assert.ok(
    !/sharing\s*=/i.test(setClause),
    "a preferência do usuário não pode ser alterada pela purga",
  );
  assert.ok(
    /ll\.sharing = true/i.test(whereClause),
    "só as linhas com sharing ligado são minimizadas",
  );
});

/* ================================================================== *
 * ATOMICIDADE DAS MIGRATIONS
 *
 * Se a migration 30 falhar, o banco não pode ficar num estado onde o SOS de
 * terceiros já está exposto mas a presença ainda aceita escrita direta.
 * ================================================================== */

test("ATOMICIDADE: depois da migration 29 sozinha o banco já está seguro", () => {
  const sql = semComentarios(sqlB());
  const exigido: Array<[string, RegExp]> = [
    ["sharing DEFAULT false", /ALTER COLUMN sharing SET DEFAULT false/i],
    ["DML fechado", /REVOKE INSERT, UPDATE, DELETE ON public\.live_locations FROM authenticated/i],
    ["policy own-select", /CREATE POLICY "live location own select"[\s\S]*?FOR SELECT/i],
    ["presence_touch", /CREATE OR REPLACE FUNCTION\s+public\.presence_touch/i],
    ["set_location_sharing", /CREATE OR REPLACE FUNCTION\s+public\.set_location_sharing/i],
    ["rate limit", /INTERVALO_MIN/],
    ["anti-teleporte", /VEL_MAX_KMH/],
  ];
  for (const [nome, re] of exigido) {
    assert.ok(re.test(sql), `a migration 29 precisa trazer ${nome} antes de expor o SOS`);
  }
});

test("ATOMICIDADE: o endurecimento vem ANTES do SOS comunitário no arquivo", () => {
  const sql = semComentarios(sqlB());
  const posRevoke = sql.search(/REVOKE INSERT, UPDATE, DELETE ON public\.live_locations/i);
  const posPresence = sql.search(/CREATE OR REPLACE FUNCTION\s+public\.presence_touch/i);
  const posTrigger = sql.search(/CREATE TRIGGER trg_sos_sync_community_alert/i);
  const posAlerts = sql.search(/CREATE OR REPLACE FUNCTION\s+public\.nearby_alerts/i);
  assert.ok(posRevoke > 0 && posPresence > 0 && posTrigger > 0 && posAlerts > 0);
  assert.ok(posRevoke < posTrigger, "fechar a escrita precisa vir antes do espelho de SOS");
  assert.ok(
    posPresence < posAlerts,
    "presence_touch precisa existir antes de nearby_alerts usá-la",
  );
});

test("ATOMICIDADE: a migration 30 só acrescenta a camada de riders", () => {
  const sql = semComentarios(sqlC());
  for (const proibido of [
    /CREATE OR REPLACE FUNCTION\s+public\.presence_touch/i,
    /CREATE OR REPLACE FUNCTION\s+public\.set_location_sharing/i,
    /REVOKE INSERT, UPDATE, DELETE ON public\.live_locations/i,
    /ALTER COLUMN sharing SET DEFAULT/i,
    /community_alerts/i,
  ]) {
    assert.ok(!proibido.test(sql), `a migration 30 não pode carregar ${proibido}`);
  }
  assert.ok(/share_with_riders/i.test(sql), "e precisa continuar trazendo o opt-in");
  assert.ok(/FUNCTION\s+public\.online_riders/i.test(sql));
  assert.ok(/FUNCTION\s+public\.trusted_contacts_online/i.test(sql));
});

/* ================================================================== *
 * ANDROID — configuração verificável sem SDK
 * ================================================================== */

test("ANDROID: SDK alvo e mínimo declarados", () => {
  const gradle = ler("android/variables.gradle");
  assert.match(gradle, /minSdkVersion\s*=\s*23/, "minSdk 23: aparelho antigo é a regra do público");
  assert.match(gradle, /compileSdkVersion\s*=\s*36/);
  assert.match(gradle, /targetSdkVersion\s*=\s*36/);
});

test("ANDROID: versionCode monotônico e package id preservado", () => {
  const app = ler("android/app/build.gradle");
  const code = Number(/versionCode\s+(\d+)/.exec(app)?.[1] ?? 0);
  assert.ok(code > 3, `versionCode ${code} precisa ser maior que o do APK anterior (3)`);
  assert.match(app, /applicationId\s+"com\.motoanjo\.app"/);
});

test("ANDROID: nenhuma permissão sem justificativa escrita", () => {
  const manifest = ler("android/app/src/main/AndroidManifest.xml");
  const permissoes = [...manifest.matchAll(/android:name="android\.permission\.([A-Z_]+)"/g)].map(
    (m) => m[1],
  );
  const esperadas = [
    "INTERNET",
    "ACCESS_NETWORK_STATE",
    "ACCESS_FINE_LOCATION",
    "ACCESS_COARSE_LOCATION",
    "RECORD_AUDIO",
    "POST_NOTIFICATIONS",
    "FOREGROUND_SERVICE",
    "FOREGROUND_SERVICE_LOCATION",
    "WAKE_LOCK",
  ];
  assert.deepEqual(
    [...new Set(permissoes)].sort(),
    [...esperadas].sort(),
    "permissão adicionada ou removida sem passar pela documentação",
  );
  assert.ok(
    !permissoes.includes("ACCESS_BACKGROUND_LOCATION"),
    "background location traz revisão extra na Play e o foreground service cobre o caso",
  );
  // Cada permissão sensível precisa de um comentário explicando o porquê.
  for (const p of ["RECORD_AUDIO", "POST_NOTIFICATIONS", "FOREGROUND_SERVICE_LOCATION"]) {
    const antes = manifest.slice(0, manifest.indexOf(p));
    assert.ok(/<!--[\s\S]*$/.test(antes.slice(-1200)), `${p} sem justificativa no Manifest`);
  }
});

test("ANDROID: o CI é gate, não gerador de APK otimista", () => {
  const wf = ler(".github/workflows/android.yml");
  for (const passo of [
    "npm ci",
    "npm test",
    "npm run typecheck",
    "npm run build",
    "cap sync android",
    "assembleDebug",
  ]) {
    assert.ok(wf.includes(passo), `o workflow precisa rodar ${passo}`);
  }
  assert.ok(/if: success\(\)/.test(wf), "artefato não pode ser publicado após falha");
  assert.ok(/sha256sum/.test(wf), "falta o SHA-256 do APK");
  assert.ok(/targetSdkVersion/.test(wf), "o CI precisa conferir o targetSdk");
  const pos = { artefato: wf.indexOf("upload-artifact"), build: wf.indexOf("assembleDebug") };
  assert.ok(pos.build < pos.artefato, "o APK precisa existir antes de ser publicado");
});

/* ================================================================== *
 * DARK MODE — a página de erro era a única exceção
 * ================================================================== */

test("DARK: a página de erro do servidor não é mais branca", () => {
  const pagina = semComentariosTs(ler("src/lib/error-page.ts"));
  assert.ok(!/#fafafa/i.test(pagina), "o fundo claro precisa sumir");
  assert.ok(/background:\s*#050505|background:\s*#0/.test(pagina), "fundo escuro do app");
  assert.ok(/color-scheme.*dark/i.test(pagina), "o navegador precisa saber que é escuro");
  assert.ok(/theme-color/i.test(pagina), "a barra de status acompanha");
  assert.ok(/safe-area-inset/.test(pagina), "notch e barra de gestos respeitados");
});
