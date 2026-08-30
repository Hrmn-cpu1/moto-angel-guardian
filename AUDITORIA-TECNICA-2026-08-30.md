# MOTO ANJO — AUDITORIA TÉCNICA PROFUNDA

Data: 2026-08-30 (UTC) · Commit auditado: `9e06e5855c181f2a058e03c7d5e1c438ad0566fa`
Branch: `edit/edt-5678ee2a-9f8c-47c1-93c5-642b3e2ea815` · `git status --short`: limpo
Últimos commits: `9e06e58` Refinou redesign visual do cockpit, `252031d`, `4a5e5e7`, `fd8616b`, `886b473`

Legenda: **PASS-exec** (executado) · **PASS-estrutural** (código lido, sem execução) · **FAIL-exec** · **FAIL-estrutural** · **NOT RUN** · **NOT PROVEN**

---

## A. EXECUTIVE SUMMARY

- **Teste Android (uso interno / campo controlado): CONDITIONAL GO.** Todos os gates de software passam (511 testes, typecheck, build, `cap sync`). O APK, porém, **não pôde ser compilado neste ambiente** (sem JDK/Android SDK) — o CI é a única prova de `assembleDebug`.
- **Release público (Play): NO-GO.** Bloqueadores: (1) o APK é um **shell remoto** — sem internet ou com o domínio fora do ar o app inteiro, inclusive o SOS, fica indisponível, sem modo degradado; (2) **não existe caminho de release assinado** provável a partir do repositório (`signingConfigs` ausente, CI só monta `assembleDebug`); (3) **detecção de queda não está ligada em lugar nenhum** — o motor existe e é testado, mas nenhum componente o instancia; (4) nada de GPS real, background, lock screen, OAuth em aparelho e notificação foi provado por execução.

O que **realmente funciona provado por execução**: lógica pura testada (SOS client, coordenadas, telefone, camadas, PKCE/estado, rota/polyline, contratos de UI), typecheck, build web/SSR e sincronização Capacitor.
O que **apenas existe no código**: serviço de primeiro plano, background tracking, notificação, deep link OAuth, envio WhatsApp, mapa/Directions em aparelho.
O que **está quebrado/ausente**: detecção de queda desconectada; webhook de confirmação de entrega do WhatsApp inexistente; release signing/minify; fallback offline.

---

## B. STACK REAL (versões comprovadas em `node_modules` e arquivos do projeto)

| Camada | Versão real |
|---|---|
| React / React DOM | 19.2.5 |
| Vite | 8.0.16 |
| TanStack Router / Start | 1.170.16 / 1.168.26 |
| TypeScript | 5.9.3 |
| Tailwind | 4.2.4 (via `@tailwindcss/vite`) |
| Supabase JS | 2.111.0 |
| Capacitor core/CLI | 7.6.8 (`@capacitor/android|app|browser|geolocation|splash-screen` ^7) |
| Plugins Capacitor detectados no sync | app 7.1.2, browser 7.0.5, geolocation 7.1.8, splash-screen 7.0.5 |
| Android | minSdk 23, compileSdk 36, targetSdk 36 (`android/variables.gradle:6-9`) |
| App | `com.motoanjo.app`, versionCode 9, versionName `1.3.9-rc9` (`android/app/build.gradle`) |
| Migrations | 36 arquivos em `supabase/migrations` |
| Server functions | 8 (`createServerFn`) em 5 arquivos |
| Testes | 511 casos, 27 arquivos listados no script `test` |

---

## C. ARQUITETURA (baseada no código)

TanStack Start (SSR + server functions) com rotas em `src/routes`, subárvore protegida por `src/routes/_authenticated/route.tsx` (`ssr:false`, `beforeLoad` → `bootstrapNativeAuth()` + `supabase.auth.getUser()`).
O Android é um **WebView Capacitor apontando para a implantação remota** (`capacitor.config.ts:53-56`, `URL_PADRAO = https://moto-angel-guardian.lovable.app`, trocável por `MOTOANJO_WEB_URL`), mais um plugin nativo (`ViagemSeguraPlugin`) e um foreground service (`ViagemSeguraService`).
Estado: local por hook + React Query; a viagem tem fonte única em `src/lib/trip.ts`; GPS web tem watcher único em `src/lib/geo-watch.ts`; camadas/z-index centralizados em `src/lib/layers.ts` e `sheets.ts`.
Rota é calculada **no servidor** (Routes API via gateway) em `src/lib/rota.functions.ts`; o mapa só desenha (`src/components/RealMap.tsx`).

---

## D. GATES EXECUTADOS

| Gate | Resultado | Evidência |
|---|---|---|
| `npm test` | **PASS-exec** | `# tests 511 / # pass 511 / # fail 0` |
| `npm run typecheck` | **PASS-exec** | `tsc --noEmit` sem saída de erro |
| `npm run build` | **PASS-exec** | `✓ built in 1.84s`, Nitro gerou `dist/server/wrangler.json` |
| `npx eslint .` (global) | **FAIL-exec (não bloqueante no CI)** | 799 problemas / 779 erros; **726 deles em `src/integrations/supabase/types.ts`** (arquivo gerado, excluído do gate bloqueante). Restam ~53 erros Prettier + 20 warnings em código-fonte |
| `npx cap sync android` | **PASS-exec** | `Sync finished in 0.496s`, 4 plugins |
| `cd android && ./gradlew assembleDebug` | **NOT RUN** | `ERROR: JAVA_HOME is not set and no 'java' command could be found` — sem JDK e sem Android SDK no sandbox |
| APK | **NOT RUN** | nenhum artefato gerado; qualquer SHA-256 seria invenção |

---

## E. P0 — bloqueia uso / segurança

**P0.1 — Detecção de queda não está conectada a nada.**
Problema: `CrashDetectionEngine` (`src/lib/crash-detection.ts:118`) não tem **nenhum consumidor de runtime**. `rg "CrashDetectionEngine|crash-detection"` fora dos testes retorna apenas a própria definição e um comentário em `src/lib/ride-telemetry.ts:125`. Não há assinatura de `devicemotion` alimentando o motor: `useRideTelemetry.ts` lê movimento apenas para o velocímetro/giroscópio da tela `/ride`.
Impacto: o recurso anunciado como salva-vidas **não existe em produção**. Zero detecção, zero countdown, zero SOS automático.
Correção: criar um hook que alimente o motor com amostras (GPS + `devicemotion`, e no nativo o listener do serviço) durante a viagem ativa, e ligar o estado `countdown` à UI de confirmação e ao `sos_open` existente. Classificação: **FAIL-estrutural**.

**P0.2 — APK é shell remoto: sem rede, sem SOS.**
Evidência: `capacitor.config.ts:53-56` (`server.url`, `cleartext:false`) e o comentário do próprio arquivo (linhas 15-27) explicando que 8 `createServerFn` impedem empacotar o frontend.
Impacto: queda de internet, DNS, TLS ou do domínio derruba **todo** o app, inclusive o botão de emergência. Não há shell offline, tela de erro própria nem caminho nativo degradado (ex.: SMS/discagem direta).
Correção mínima realista: um caminho de emergência **nativo** independente do WebView (intent de discagem/WhatsApp com contatos em cache) + tela de erro própria; caminho completo em `HOSTING-DECOUPLING-PLAN.md` (mover server functions para o backend). **FAIL-estrutural (risco conhecido e documentado).**

**P0.3 — Não existe caminho de release assinado provável.**
Evidência: `android/app/build.gradle` sem bloco `signingConfigs`; `minifyEnabled false`; `proguard-rules.pro` é o stub padrão; o CI (`.github/workflows/android.yml`) só executa `assembleDebug`.
Impacto: nenhum APK/AAB publicável é gerado nem validado; R8/minify jamais são exercitados.
Correção: adicionar `signingConfigs` alimentado por secrets do CI e um job `assembleRelease` (mesmo que só em `workflow_dispatch`). **FAIL-estrutural.**

**P0.4 — Todo o comportamento de aparelho continua NOT PROVEN.**
GPS real, foreground service com tela apagada, notificação, OAuth Google no APK, mapa e rota no aparelho: nenhum teste de unidade prova qualquer um deles. Ver seção O.

---

## F. P1 — experiência principal

**P1.1 — Corrida entre o deep link OAuth e o guard de rota.** `src/lib/native-auth.ts:311-313` trata `appUrlOpen` como fire-and-forget (`void handleNativeAuthUrl(...)`), enquanto `src/routes/_authenticated/route.tsx:8-13` só aguarda `bootstrapNativeAuth()` e em seguida chama `getUser()`. Se o link chegar com o app já rodando, o guard pode redirecionar para `/login` antes de `SESSION_CONFIRMED`. Correção: o guard consultar `getNativeAuthSnapshot()` e aguardar o job pendente. **NOT PROVEN, estruturalmente plausível.**

**P1.2 — Esquema OAuth customizado não verificado.** `AndroidManifest.xml:29-34` usa `com.motoanjo.app://auth` sem App Links verificados (`autoVerify` + assetlinks). Outro app pode registrar o mesmo esquema. **Não há roubo de sessão** (o código recusa tokens na URL, `native-auth.ts:203-211`, e o code é single-use + PKCE), mas há **negação do login**. Correção: App Link https verificado.

**P1.3 — Morte de processo durante a viagem não é reconciliada.** `ViagemSeguraService` devolve `START_NOT_STICKY` em todos os caminhos; após um kill do sistema, `consultarEstado()` lê estado estático já perdido. O usuário não distingue "parei" de "o Android matou". Correção: reconciliar no retorno ao foreground contra a viagem em `src/lib/trip.ts`.

**P1.4 — Efeito de rota com dependências incompletas (stale closure controlado).** `src/components/RealMap.tsx:537-690`: o efeito usa `center` mas depende de `originKey` (arredondado a 2 casas ≈ 1,1 km). É intencional para não recalcular a cada tick, e há mitigação por `centerRef`; ainda assim é um `exhaustive-deps` suprimido de fato. Não observei recriação de mapa nem de marcadores por tick — a reconciliação incremental de overlays e `userMarkerRef` está preservada (**PASS-estrutural**).

**P1.5 — Sem recálculo de rota por desvio.** Só há recálculo quando o destino muda ou a origem se desloca ~1 km; não existe detecção de "saiu da rota". Em navegação real, a manobra exibida fica errada após um desvio. **FAIL-estrutural.**

---

## G. P2 / P3

- **P2** Sem wake lock no `ViagemSeguraService`; OEMs agressivos (Xiaomi/Samsung/Huawei) podem estrangular o GPS com a tela apagada.
- **P2** Canal de notificação `IMPORTANCE_LOW`, sem `setFullScreenIntent`: nenhum alerta de queda/SOS acorda a tela bloqueada.
- **P2** Webhook de entrega do WhatsApp inexistente: `mark_sos_notification_delivered` existe no banco e nunca é chamado — status `delivered` é inalcançável.
- **P2** `allowBackup="true"` sem `dataExtractionRules`: a sessão Supabase no `localStorage` do WebView pode entrar em backup.
- **P2** CI valida apenas `assembleDebug`; `google-services.json` malformado é engolido por `catch(Exception)` em `android/app/build.gradle`.
- **P2** Migrations com carimbos duplicados/reordenados criam histórico frágil.
- **P2** `MapSosButton`, `SosFab` e `sos.tsx` instanciam `useSosController` independentemente; hoje não coexistem, mas nada estrutural impede o retorno do bug de canal realtime duplicado.
- **P3** `allowNavigation` com curingas amplos (`*.google.com`, `*.googleapis.com`).
- **P3** Sem certificate pinning; sem rate limit explícito em `exchangeNativeCode` (mitigado por entropia).
- **P3** 726 erros Prettier em `types.ts` (gerado) mascaram o lint global.

---

## H. MAPA / NAVEGAÇÃO — estado real

- Inicialização, retry e estados READY/LOADING/ERROR existem; o mapa não é recriado por mudança de camada (efeitos separados por `showTraffic`, heat, POIs, alertas, riders, parceiros).
- Marcador do usuário criado uma vez e atualizado por refs (posição + heading) — **sem recriação por tick GPS**. **PASS-estrutural.**
- Rota vem do servidor (`calcularRota`), com `requestId` + `cancelled` contra respostas fora de ordem. Falha vira `indisponivel` com diagnóstico, sem inventar distância. **PASS-estrutural.**
- `fitBounds` roda **uma vez por destino** (`enquadradoParaRef`), com padding vindo dos painéis — a câmera não briga com o "seguir". **PASS-estrutural.**
- Dados do cockpit: velocidade e heading vêm do GPS real (`useGeolocation`/`geo-watch`, filtrados por `Number.isFinite` e velocidade mínima); ETA, distância, manobra e rua vêm da resposta real da Routes API. Nenhum mock encontrado. Alerta do copiloto depende dos dados de alerta reais. **PASS-estrutural / NOT PROVEN em aparelho.**
- Ausente: recálculo por desvio (P1.5) e atualização progressiva da manobra ao longo do trecho (só o passo 0 é publicado no retorno da rota).

---

## I. ANDROID / BACKGROUND — estado real

- `ViagemSeguraService` declarado no manifest com `foregroundServiceType="location"`, `exported=false`, `stopWithTask=true`; `startForeground` é chamado no início de `onStartCommand` com o tipo correto em API 34+.
- `POST_NOTIFICATIONS` declarada e pedida em contexto; degradação sem crash quando negada.
- `ACCESS_BACKGROUND_LOCATION` deliberadamente não declarada (o FGS location cobre o caso).
- Lock screen: **existe** notificação persistente `VISIBILITY_PUBLIC`; **não existe** full-screen intent, activity sobre bloqueio nem mapa na tela bloqueada.
- Nada disso foi executado: **NOT PROVEN**.

---

## J. SOS — estado real

- Fluxo: UI hold-to-fire → `triggerSos` (server fn, autenticada, zod: uuid de idempotência, coordenada válida, precisão ≤500 m, fix ≤60 s) → RPC `sos_open` → `dispatchSosNotifications` (re-checa posse antes de usar `supabaseAdmin`) → WhatsApp Cloud API com fallback manual `wa.me`.
- Idempotência por `requestId`; cancelamento/resolução por RPC; ambiguidade de coluna do PL/pgSQL corrigida por migration; `risk_heatmap` já não expõe histórico bruto; gravação direta em `sos_events` fechada por RLS.
- Aberto: sem webhook de entrega (status `delivered` inalcançável), sem guarda estrutural contra dois `useSosController` montados juntos, `sos_purge_history` cascateia no espelho `community_alerts`.
- Nenhum disparo real executado: **NOT PROVEN**.

---

## K. AUTH — estado real

- E-mail/senha e Google OAuth via broker; no APK o fluxo é Custom Tab + deep link com **Auth Code + PKCE**, tokens na URL explicitamente recusados.
- Dedup de callback (`processedCallbacks`/`callbackJobs`) cobre `appUrlOpen` + `getLaunchUrl` (cold start); timeout de 180 s fecha o Custom Tab.
- Riscos abertos: P1.1 (corrida com o guard), P1.2 (esquema não verificado), e o redirecionamento do Custom Tab depender de gesto do usuário (mitigado por botão manual).

---

## L. SUPABASE / SEGURANÇA — estado real

- 36 migrations; RLS habilitada nas tabelas críticas; funções sensíveis em `SECURITY DEFINER` com checagem de posse; `mark_sos_notification_delivered` restrita a `service_role`.
- Nenhum secret real encontrado versionado. `.env.production` contém **apenas valores públicos** (URL Supabase, publishable key, chave de navegador do Maps restrita por referrer) — legítimo. `SUPABASE_SERVICE_ROLE_KEY` só aparece como nome em `.env.example` e é lida em `client.server.ts`. O CI tem varredura de segredos bloqueante (com allowlist para `.env.example` e patches `RC*.patch` — ponto fraco P3).
- Nenhuma migration foi aplicada nesta auditoria.

---

## M. PERFORMANCE

- **Bom:** watcher único de GPS (`geo-watch.ts`), reconciliação incremental de marcadores (`marker-sync.ts`), overlays destruídos no cleanup de cada efeito, `requestId` para descartar respostas obsoletas, memoização das listas passadas ao mapa em `dashboard.tsx`.
- **Vigiar:** `centerRef.current = center` atribuído durante o render (mutação em render — funciona, mas é padrão frágil); efeito de rota com deps reduzidas (P1.4); múltiplos `useSosController` potencialmente co-montados (P2).
- Nenhum `setInterval` órfão, listener de mapa sem `remove` ou canal realtime sem `removeChannel` foi encontrado nos arquivos auditados.

---

## N. APK

**NOT RUN** — sem JDK/Android SDK no ambiente (`JAVA_HOME` ausente). Nenhum arquivo `.apk` foi produzido; nenhum caminho, tamanho ou SHA-256 pode ser informado. A única fonte válida de APK hoje é o job `gate` do GitHub Actions.

---

## O. TESTE FÍSICO AINDA NECESSÁRIO (checklist)

1. Login Google no APK: cold start, app já aberto, cancelar no meio, segundo login.
2. Sessão persistente após matar o app e após reiniciar o aparelho.
3. GPS: permissão negada, negada permanentemente, GPS desligado, área sem sinal, timeout.
4. Mapa e rota em aparelho real (chave Maps por referrer dentro do WebView).
5. Viagem Segura com a tela apagada por ≥20 min, em Samsung/Xiaomi com economia de bateria agressiva.
6. Notificação persistente na tela de bloqueio; app removido dos recentes.
7. SOS real ponta a ponta com contato de verdade (WhatsApp API e fallback `wa.me`).
8. SOS em modo avião / rede instável.
9. Comportamento com o domínio remoto inacessível (desligar Wi-Fi/dados durante o uso).
10. Consumo de bateria em 1 h de viagem.

---

## P. PLANO DE EXECUÇÃO

**P0 (nesta ordem)**
1. *Ligar a detecção de queda.* Arquivos: novo `src/hooks/useCrashDetection.ts`, `src/routes/_authenticated/dashboard.tsx`, `src/lib/crash-detection.ts` (sem mudar o motor). Teste: novo arquivo de teste alimentando o hook com série sintética + verificação de que `sos` chama o mesmo `sos_open`. Conclusão: countdown aparece na UI e cancelamento funciona.
2. *Caminho de emergência resiliente.* Arquivos: `src/lib/external-navigation.ts`, plugin nativo, cache local de contatos. Teste: unitário do fallback + teste físico item 8/9. Conclusão: SOS acionável com o domínio fora do ar.
3. *Release assinado no CI.* Arquivos: `android/app/build.gradle`, `.github/workflows/android.yml`. Teste: job `assembleRelease` verde com artefato + SHA. Conclusão: AAB/APK assinado disponível.

**P1**
4. Guard aguardar o job nativo de auth (`_authenticated/route.tsx`, `native-auth.ts`) — teste estrutural + item 1 do checklist físico.
5. App Link verificado para o callback (`AndroidManifest.xml`, `assetlinks.json` no host).
6. Recálculo por desvio de rota (`RealMap.tsx`, `rota.ts`) — teste unitário de "distância da polilinha".
7. Reconciliação de viagem após morte de processo (`trip.ts`, plugin).

**P2/P3**
8. Wake lock + canal de alta importância com full-screen intent para queda/SOS.
9. Webhook de entrega do WhatsApp.
10. `dataExtractionRules`, minify/R8, endurecer allowlist de navegação, limpar `types.ts` do lint global.

*Nenhum arquivo do projeto foi modificado nesta auditoria (apenas este relatório foi criado).*
