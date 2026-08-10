# PROMPT DE CONTINUAÇÃO — MOTO ANJO (entregar ao Claude junto com o repositório)

**Antes de editar qualquer arquivo, leia `HANDOFF_MOTO_ANJO.md`,
`PROJECT_STATUS.md` e `NEXT_STEPS.md` e depois audite o código real do
repositório para confirmar que a documentação corresponde ao estado atual.**
Relate qualquer divergência antes de mudar qualquer coisa.

**Não reconstrua o Moto Anjo. Continue do estado existente.**

## O que é

App de segurança para motociclistas: SOS com localização, aviso automático a
contatos por WhatsApp, mapa em tempo real com riders e zonas de risco,
comunidade, histórico e telemetria. Identidade "Graphite & Gold" (preto #050505,
dourado #D4AF37, vermelho #D92323 só para emergência). Português do Brasil.

## Stack

React 19 · TypeScript · TanStack Start 1 + TanStack Router (rotas por arquivo) ·
TanStack Query · Vite 8 · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres, Auth,
RLS, RPCs SECURITY DEFINER) · Capacitor 7 / Android · Google Maps JavaScript API ·
GitHub Actions (Node 22, JDK 21, Android SDK, Gradle).

## Arquitetura Android

```
APK Android (com.motoanjo.app, versionCode 3, versionName 1.2)
  → Capacitor 7 / WebView
  → server.url = https://moto-angel-guardian.lovable.app
  → TanStack Start (SSR em Worker/edge)
  → Supabase
```
Consequência: o APK **não** empacota o bundle. Toda mudança de frontend só chega
ao aparelho depois de publicar a web, e o app exige internet.

## Auth Android (VALIDADO FISICAMENTE NO SAMSUNG)

```
Moto Anjo → Custom Tab → Google OAuth → callback HTTPS /auth/callback?native=1&cc=<challenge>
→ PKCE → deep link com.motoanjo.app://auth/callback?code=<opaco>
→ App.addListener("appUrlOpen") ou App.getLaunchUrl() (cold start)
→ handler idempotente (handleNativeAuthUrl) → exchangeNativeCode → sessão Supabase → Dashboard
```
Nenhum token trafega na URL; o código é opaco, de uso único, 5 min.
Arquivos: `src/lib/native-auth.ts`, `src/lib/native-auth.functions.ts`,
`src/lib/native.ts`, `src/routes/auth.callback.tsx`, `src/hooks/useAuth.ts`,
`src/routes/_authenticated/route.tsx`. **Não exportar tokens nem secrets.**

## SOS — Checkpoint 1B

```
SosHoldButton (hold 3 s) → useSosController → geolocalização → validação de
coordenadas (fix < 60 s, precisão ≤ 500 m, velocidade plausível, cooldown 15 s)
→ request_id (UUID no cliente) → server fn → RPC sos_open → sos_events
→ fila whatsapp_notifications → Meta Cloud API (fallback wa.me)
```
Garantias: idempotência por `request_id`; **um único SOS ativo por usuário**
(índice parcial); cancelamento (`sos_cancel`), resolução (`sos_resolve`),
expiração e `superseded` tratados no `sos_open` endurecido; `sos_events` é
**somente leitura** para o cliente (INSERT/UPDATE/DELETE negados por RLS);
**zero DML direto no frontend** (verificado por busca global); limpeza segura via
`sos_purge_history()`; claim atômico na fila evita envio duplicado.
Migrations do Checkpoint 1/1B: `20260810153319`, `20260810153455`,
`20260810153540`, `20260810153651`. **105/105 testes passando.**

## Google Maps

Sintoma anterior: mapa-base preto no Samsung. Diagnóstico provou tiles HTTP 200 e
chave/referrer/billing corretos. **Causa: contraste insuficiente do `DARK_STYLE`**
em `src/components/RealMap.tsx` (ruas `#161616` sobre `#0a0a0a`). Correção: nova
paleta legível apenas nessa constante. Não exigiu novo APK.
**Aguardando revalidação física no Samsung.**
Chave: `VITE_GOOGLE_MAPS_BROWSER_KEY` (própria, prioritária) → fallback
`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` (só vale em `*.lovable.app`).
`gm_authFailure` já degrada para coordenadas + botão "Abrir no Google Maps".

## Supabase

14 tabelas em `public`, todas com RLS e GRANTs: `profiles`, `emergency_contacts`,
`sos_events`, `whatsapp_notifications`, `trips`, `community_posts/comments/likes/alerts`,
`live_locations`, `location_shares`, `partners`, `user_roles`, `native_auth_codes`.
Papéis ficam em `user_roles` + `has_role()` — nunca no perfil. Toda tabela nova
precisa de `GRANT` + RLS + policies na mesma migration. 27 migrations aplicadas.

## Proibições

- Não quebrar o que já está validado: Auth nativa, SOS 1B, guards, deep links.
- Não editar migrations já aplicadas; mudanças de banco só em migration nova.
- Não trocar o roteador (é TanStack Router por arquivo; nunca react-router).
- Não editar `src/integrations/supabase/*` nem `src/routeTree.gen.ts`.
- Não alterar branding, `applicationId`, versionCode/versionName sem pedido.
- Não adicionar/remover funcionalidades por conta própria; não colocar secrets no repo.

## Próxima prioridade

P0: revalidar o Google Maps no Samsung (fechar e reabrir o APK v3).
Depois seguir `NEXT_STEPS.md` na ordem.

## Como validar qualquer mudança

```sh
npm ci && npm test && npm run typecheck && npm run build
npx cap sync android
cd android && chmod +x gradlew && ./gradlew assembleDebug
```
Os 105 testes precisam continuar passando.
