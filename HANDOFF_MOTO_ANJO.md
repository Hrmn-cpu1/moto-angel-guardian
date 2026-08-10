# HANDOFF — MOTO ANJO

Documento de transferência técnica. Estado auditado diretamente no código em
**2026-08-10**, commit base `13912808dc694ef7aa4bd3c074c76a970fe7f771`.
Nada aqui foi assumido a partir de histórico de conversa.

---

## 1. Identificação

| Item | Valor |
| --- | --- |
| Projeto | Moto Anjo — segurança para motociclistas |
| Pacote npm | `tanstack_start_ts` (privado) |
| URL de produção | https://moto-angel-guardian.lovable.app |
| applicationId Android | `com.motoanjo.app` |
| versionCode / versionName | `3` / `1.2` |
| Node | 22 (workflow) |
| JDK | 21 Temurin |
| minSdk / compileSdk / targetSdk | 23 / 35 / 35 (`android/variables.gradle`) |
| Capacitor | ^7 (core, cli, android, app, browser, geolocation, splash-screen) |
| Framework web | TanStack Start ^1.168 + TanStack Router ^1.170, React 19, Vite 8 |
| Estilo | Tailwind CSS v4 (`src/styles.css`), shadcn/ui, Sonner |
| Dados | Supabase (Lovable Cloud) — `@supabase/supabase-js` ^2.111 |
| Gráficos / mapa | Recharts, Google Maps JavaScript API |
| Testes | `node --test` com strip-types — **105/105** |

## 2. Arquitetura real

```
Android APK (com.motoanjo.app, versionCode 3)
   ↓
Capacitor 7 / WebView (MainActivity extends BridgeActivity)
   ↓
server.url = https://moto-angel-guardian.lovable.app   (capacitor.config.ts)
   ↓
Moto Anjo publicado (TanStack Start, SSR em Worker/edge)
   ↓
Supabase (Postgres + Auth + RLS + RPCs)
```

O APK **não** empacota o bundle web. `webDir: dist/client` existe apenas porque
o CLI exige, mas o WebView carrega a versão publicada. Consequência desejada:
a origem do WebView é `https://moto-angel-guardian.lovable.app`, então
`window.location.origin` do OAuth e a chave do Google Maps restrita por
referrer valem também dentro do app.

### O que roda onde

| Camada | Responsabilidades |
| --- | --- |
| APK / nativo | permissão de localização em runtime (`@capacitor/geolocation`), splash (`@capacitor/splash-screen`), Custom Tab do login (`@capacitor/browser`), deep link (`@capacitor/app`: `appUrlOpen` + `getLaunchUrl`) — tudo em `src/lib/native.ts` e `src/lib/native-auth.ts` |
| Frontend | rotas, UI, hold do SOS, GPS via `navigator.geolocation`, mapa, feed, telemetria, cache TanStack Query |
| Servidor (createServerFn) | `src/lib/sos.functions.ts` (abrir SOS + despachar fila), `src/lib/native-auth.functions.ts` (PKCE stash/exchange), `src/lib/pois.functions.ts` |
| Supabase | tabelas, RLS, RPCs (`sos_open`, `sos_cancel`, `sos_resolve`, `community_feed`, `nearby_alerts`, `online_riders`, `risk_heatmap`, `admin_stats`, `admin_activity`, …) |
| Serviços externos | Google Maps JavaScript API; Meta WhatsApp Cloud API (`graph.facebook.com/v20.0`) em `src/lib/sos.server.ts`; fallback manual `wa.me` |

### Mapa de rotas (`src/routes`)

Públicas: `/` (index), `/welcome`, `/intro`, `/login`, `/register`,
`/forgot-password`, `/reset-password`, `/auth/callback`, `/terms`, `/privacy`,
`/.lovable/oauth/consent`, `/mcp` + `/.mcp/*` + `/.well-known/*`.

Protegidas (`src/routes/_authenticated/route.tsx` é o guard):
`dashboard`, `map`, `sos`, `ride`, `trip`, `history`, `contacts`, `community`,
`alerts`, `benefits`, `notifications`, `profile`, `sharing`, `admin`.

## 3. Autenticação

### Google OAuth no Android (validado fisicamente em aparelho Samsung — entrou no Dashboard)

```
Moto Anjo (APK)
 → @capacitor/browser abre Custom Tab
 → Google OAuth (accounts.google.com)
 → callback HTTPS  /auth/callback?native=1&cc=<code_challenge>
 → servidor guarda a sessão (stashNativeSession) e devolve um CODE opaco
 → deep link  com.motoanjo.app://auth/callback?code=<opaco>
 → App.addListener('appUrlOpen')  +  App.getLaunchUrl()  (cold start)
 → handleNativeAuthUrl(url, source)  — idempotente, nunca processa 2x
 → exchangeNativeCode(code, code_verifier)  → tokens por HTTPS
 → supabase.auth.setSession → confirmação via getSession()
 → route guard libera → /dashboard
```

PKCE (RFC 7636): o app sorteia `code_verifier`, envia só o
`code_challenge` (SHA-256/base64url). **O deep link transporta apenas um código
opaco, de uso único e validade de 5 minutos — nunca access_token, refresh_token
ou senha.**

Arquivos envolvidos:
- `src/lib/native-auth.ts` — par PKCE, Custom Tab, `handleNativeAuthUrl`, `bootstrapNativeAuth`, estado `nativeAuthProcessing`
- `src/lib/native-auth.functions.ts` — `stashNativeSession` / `exchangeNativeCode` (server functions, `supabaseAdmin`)
- `src/lib/native.ts` — `bootstrapNative()` no boot do app
- `src/routes/auth.callback.tsx` — callback HTTPS; captura a URL no import antes de o supabase-js limpar o hash
- `src/hooks/useAuth.ts` — store único de sessão, `nativeAuthProcessing`
- `src/routes/_authenticated/route.tsx` — guard não conclui "deslogado" enquanto o callback nativo está em processamento
- `android/app/src/main/AndroidManifest.xml` — intent-filter `scheme=com.motoanjo.app`, `host=auth`, `launchMode=singleTask`
- Tabela `public.native_auth_codes` + RPC `purge_native_auth_codes()`

### E-mail/senha
`useAuth.register` → `supabase.auth.signUp` com
`emailRedirectTo = ${origin}/auth/callback`. Confirmação de e-mail está **ativa**:
sem sessão imediata o app retorna `status: "confirm_email"` e mostra a tela
"Confirme seu e-mail" (reenvio via `resendConfirmationEmail`).
Conta já existente é detectada por `identities: []` (o Supabase responde 200 por
anti-enumeração) e vira o erro `google_only_account`.
Mensagens traduzidas em `src/lib/auth-errors.ts`.
Recuperação de senha: `/forgot-password` → e-mail → `/reset-password`.
Persistência: `localStorage` do supabase-js; logout via `supabase.auth.signOut()`.

Redirects que precisam estar autorizados no provedor de auth:
`https://moto-angel-guardian.lovable.app`, `.../auth/callback`,
o preview `https://id-preview--532c42c1-6f30-4d66-a5ad-6bf7cc4eaade.lovable.app`
e `http://localhost:8080` para desenvolvimento.

## 4. SOS — Checkpoint 1B

### Fluxo

```
hold 3 s (SosHoldButton, SOS_HOLD_MS=3000)
 → GPS novo (getCurrentPosition, enableHighAccuracy)
 → validação em sos-client.ts:
      fix > 60 s (SOS_MAX_FIX_AGE_MS) → recusa
      precisão > 500 m (SOS_MAX_ACCURACY_M) → recusa; > 100 m → aviso
      velocidade impossível (>120 m/s) → recusa
      cooldown 15 s entre acionamentos
 → request_id (UUID gerado no cliente, persistido em localStorage por 6 h)
 → server fn triggerSos → RPC sos_open(request_id, lat, lng, accuracy, fix_age, note)
 → linha em sos_events (ou a existente devolvida: reused=true)
 → fila em whatsapp_notifications
 → dispatchSosNotifications → claim_sos_notifications → Meta Graph API
      (sem credenciais: fallback manual wa.me pelo SosPanel)
 → settle_sos_notification / mark_sos_notification_delivered
```

### Arquivos
`src/lib/sos-client.ts` (constantes, validações, request_id, storage local),
`src/lib/coords.ts` (formatação/haversine), `src/hooks/useSosController.ts`
(controller único), `src/components/SosPanel.tsx`,
`src/components/SosHoldButton.tsx`, `src/components/SosFab.tsx`,
`src/components/MapSosButton.tsx`, `src/routes/_authenticated/sos.tsx`,
`src/lib/sos.functions.ts` (server fns), `src/lib/sos.server.ts` (WhatsApp Cloud API).
Os três acionadores (FAB, mapa, tela `/sos`) usam **o mesmo** `useSosController`.

### Regras garantidas no banco
- **Idempotência**: `request_id` único; `sos_open` devolve o evento existente (`reused`).
- **Um SOS ativo por usuário**: índice parcial único.
- **RLS**: `sos_events` é *somente leitura* para o app (`sos_select_own`); INSERT/UPDATE/DELETE negados — só via RPC `SECURITY DEFINER`.
- **Frontend sem escrita direta** em `sos_events` (verificado por busca global).
- Cancelamento (`sos_cancel`, carimba `cancelled_at`/`cancel_reason`), resolução (`sos_resolve`), expiração/`superseded` tratados no `sos_open` endurecido, limpeza segura via `sos_purge_history()`.
- Fila WhatsApp com claim atômico (`claim_token`, `claimed_at`) evitando envio duplicado.

### Migrations do Checkpoint 1/1B
1. `20260810153319_...` — Checkpoint 1 parte 1: colunas `request_id`, `accuracy_m`, `fix_age_ms`, `cancelled_at`, `cancel_reason`, `resolved_at`, `updated_at`; índice único parcial; RPCs `sos_open`, `sos_cancel`, `sos_resolve`.
2. `20260810153455_...` — Checkpoint 1 parte 2: fila `whatsapp_notifications` com `request_id`, `claim_token`, dedupe e `claim_sos_notifications` / `settle_sos_notification`.
3. `20260810153540_...` — Checkpoint 1B parte 1: `sos_events` somente leitura para `authenticated`.
4. `20260810153651_...` — Checkpoint 1B parte 2: `sos_open` endurecido contra corrida.

Testes: **105/105** (`src/lib/sos-client.test.ts`, `sos.server.test.ts`,
`sos-unificacao.test.ts`, `coords.test.ts`, `phone.test.ts`).

## 5. Banco Supabase

Todas as tabelas ficam em `public`, com RLS habilitada e GRANTs explícitos.
Tipos gerados em `src/integrations/supabase/types.ts`.

| Tabela | Finalidade | Colunas principais | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- | --- | --- |
| `profiles` | perfil do motociclista | name, email, phone, bike_model, plate, blood_type, emergency_contact/phone, avatar_url, terms_accepted_at/version | dono | dono | dono | dono |
| `emergency_contacts` | contatos de emergência | name, phone, relation, is_primary | dono | dono | dono | dono |
| `sos_events` | eventos de emergência | latitude, longitude, accuracy_m, fix_age_ms, status, request_id, triggered_at, cancelled_at, resolved_at | dono | **negado** | **negado** | **negado** |
| `whatsapp_notifications` | fila de aviso aos contatos | sos_event_id, recipient_phone, status, attempts, provider_message_id, claim_token | dono | negado | negado | negado |
| `trips` | histórico de viagens | started_at, ended_at, duration_seconds, distance_km, avg_speed, companion | dono | dono | dono | dono |
| `community_posts` | feed | author_name, category, region, text | autenticados | autor | autor | autor |
| `community_comments` | comentários | post_id, text | autenticados | autor | autor | autor |
| `community_likes` | curtidas | post_id, user_id | autenticados | autor | — | autor |
| `community_alerts` | alertas na via | type, title, description, address, lat, lng | autenticados | autor | autor | autor |
| `live_locations` | posição ao vivo | lat, lng, speed_kmh, heading, sharing | dono + contato confiável aprovado | dono | dono | dono |
| `location_shares` | pedidos de acompanhamento | owner_id, viewer_id, status | participantes | viewer (pending) | owner (approved/revoked) | participantes |
| `partners` | parceiros/benefícios | name, category, benefit, logo_url, lat, lng, featured | autenticados (ativos) | negado | negado | negado |
| `user_roles` | papéis (`admin`/`user`) | user_id, role | dono | negado | negado | negado |
| `native_auth_codes` | códigos PKCE do login nativo | code, code_challenge, tokens, expires_at | **negado a todos** (só `service_role`) | negado | negado | negado |

RPCs relevantes: `sos_open`, `sos_cancel`, `sos_resolve`, `sos_active_event`,
`sos_purge_history`, `claim_sos_notifications`, `settle_sos_notification`,
`mark_sos_notification_delivered`, `community_feed`, `nearby_alerts`,
`risk_heatmap`, `online_riders`, `is_trusted_contact`, `has_role`,
`request_location_access`, `location_share_inbox`, `user_history`,
`admin_stats`, `admin_activity`, `normalize_phone`, `purge_native_auth_codes`.

Migrations em `supabase/migrations/` (ordem cronológica, 27 arquivos):
`20260729155944`, `20260729160006`, `20260729163407`, `20260729165126`,
`20260729174210`, `20260729174423`, `20260729190519`, `20260731073632`,
`20260731073923`, `20260731073948`, `20260731075416`, `20260731075502`,
`20260731081122`, `20260731081937`, `20260731125214`, `20260731125409`,
`20260731125530`, `20260731130155`, `20260731130221`, `20260731130528`,
`20260731141820`, `20260803214632`, `20260810153319` (SOS 1), `20260810153455`
(SOS 1 fila), `20260810153540` (SOS 1B RLS), `20260810153651` (SOS 1B hardening),
`20260810180909` (native_auth_codes). **Não editar migrations já aplicadas.**

## 6. Google Maps / GPS — PENDÊNCIA ABERTA

Estado observado no APK v3 em aparelho físico: autenticação OK, Dashboard abre,
componentes do mapa e o marcador aparecem, **mas o mapa-base fica preto — os
tiles não renderizam**.

Implementação: `src/components/RealMap.tsx`
- Carrega o script `https://maps.googleapis.com/maps/api/js` dinamicamente (`loadGoogleMaps`), com `channel` opcional.
- Chave: `import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY` (própria, prioritária) → fallback `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` (gerenciada pelo Lovable, **restrita a `*.lovable.app` / `*.lovableproject.com`**).
- Hook global `gm_authFailure` já implementado: em falha de chave o app degrada para coordenadas cruas + botão "Abrir no Google Maps".

Como diagnosticar (Chrome DevTools remoto: `chrome://inspect` com o Samsung por USB, abrir o WebView do `com.motoanjo.app` e ler o console):
- `RefererNotAllowedMapError` — o referrer enviado pelo WebView não está na allowlist da chave. Adicionar `https://moto-angel-guardian.lovable.app/*`. Se o WebView enviar origem `https://localhost` ou vazia, a chave gerenciada nunca vai servir: é preciso chave própria com restrição por referrer compatível (ou sem restrição, temporariamente, só para diagnóstico).
- `InvalidKeyMapError` — variável ausente no build publicado.
- `ApiNotActivatedMapError` — Maps JavaScript API desativada no projeto Google Cloud.
- `BillingNotEnabledMapError` / mapa cinza com marca d'água — billing desligado.
- Tiles pretos **sem erro no console** — normalmente CSS: container com altura 0/`position` errada, ou o tema escuro custom sobrepondo. Comparar com o mesmo Dashboard aberto no Chrome do celular (fora do APK): se lá funciona, o problema é WebView/referrer; se lá também falha, é chave/CSS.

**PRÓXIMA TAREFA PRIORITÁRIA: corrigir o mapa-base preto no Samsung sem alterar Auth ou SOS.**

GPS: `src/hooks/useGeolocation.ts` usa `watchPosition`; a permissão em runtime é
pedida por `ensureNativeLocationPermission()` (`@capacitor/geolocation`).
`src/hooks/useRideTelemetry.ts` cobre velocímetro e giroscópio.

## 7. Android

Arquivos versionados: `capacitor.config.ts`, `android/` completo
(`build.gradle`, `settings.gradle`, `variables.gradle`, wrapper Gradle,
`app/build.gradle`, `AndroidManifest.xml`, `MainActivity.java`, `res/` com
ícones adaptativos + splash, `assets/.gitkeep`, `file_paths.xml`,
`capacitor.settings.gradle`, `capacitor-cordova-android-plugins`).

- `applicationId = com.motoanjo.app`, `namespace = com.motoanjo.app`
- `versionCode = 3`, `versionName = "1.2"`
- `MainActivity extends BridgeActivity`, `launchMode="singleTask"`
- Intent filters: LAUNCHER + VIEW/BROWSABLE `scheme=com.motoanjo.app`, `host=auth`

| Permissão | Razão |
| --- | --- |
| `INTERNET` | o WebView carrega a aplicação publicada |
| `ACCESS_NETWORK_STATE` | Capacitor/WebView checa conectividade |
| `ACCESS_FINE_LOCATION` | SOS e mapa precisam de posição precisa |
| `ACCESS_COARSE_LOCATION` | degradação quando o usuário concede só aproximada |
| `uses-feature location.gps required=false` | o app continua utilizável sem GPS |
| `<queries>` `com.whatsapp`, `com.whatsapp.w4b`, VIEW/https | abrir WhatsApp e links externos no Android 11+ |

`android/app/src/main/assets/.gitkeep` **não pode ser removido** — sem o
diretório, `npx cap sync android` falha com ENOENT em checkout limpo.

## 8. GitHub Actions

`.github/workflows/android-debug.yml` — "Android Debug APK (v3)",
`workflow_dispatch` + push em `main`. Passos:
checkout → Node 22 (cache npm) → JDK 21 Temurin → Android SDK → `npm ci` →
`npm test` → `npm run typecheck` → `npm run build` →
`mkdir -p android/app/src/main/assets` → `npx cap sync android` →
`chmod +x gradlew` → `./gradlew assembleDebug --no-daemon --stacktrace` →
tamanho + SHA-256 no summary → artifact `moto-anjo-debug-v3` (30 dias).

A execução **#3 terminou com SUCESSO e produziu o artifact**.

## 9. Variáveis de ambiente

Ver `.env.example` (apenas nomes e placeholders). Resumo:

| Variável | Onde | Obrigatória |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | frontend (`src/integrations/supabase/client.ts`, `src/lib/mcp/index.ts`) | sim |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` | servidor | sim |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor (`client.server.ts`, `supabaseAdmin`) | sim fora do Lovable |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | frontend (`RealMap.tsx`) | recomendada — é o caminho da correção do mapa |
| `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` / `_TRACKING_ID` | frontend, fallback gerenciado | opcional |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | servidor (`sos.server.ts`) | opcional (sem elas, fallback `wa.me`) |
| `LOVABLE_API_KEY` | servidor (gateway de conectores) | opcional |

## 10. Como rodar

Ver `README.md`.
