# PROMPT DE CONTINUAÇÃO — MOTO ANJO (entregar ao Claude junto com o repositório)

**Antes de editar qualquer arquivo, audite o repositório e compare o código real
com `HANDOFF_MOTO_ANJO.md` e `PROJECT_STATUS.md`.** Se encontrar divergência,
relate antes de mudar qualquer coisa.

**Depois: continue primeiro corrigindo exclusivamente o Google Maps preto no
Samsung, preservando Auth e SOS.**

---

## O que é o Moto Anjo

Aplicativo de segurança para motociclistas: acionamento de emergência (SOS) com
localização, contatos de confiança avisados por WhatsApp, mapa em tempo real com
outros motociclistas e zonas de risco, comunidade, histórico de viagens e
telemetria (velocímetro/inclinação). Identidade visual "Graphite & Gold":
preto profundo, dourado metálico, vermelho só para emergência. Português do Brasil.

## Arquitetura

```
APK Android (com.motoanjo.app, versionCode 3, versionName 1.2)
  → Capacitor 7 / WebView
  → server.url = https://moto-angel-guardian.lovable.app
  → TanStack Start (React 19, Vite 8, Tailwind v4, SSR em Worker/edge)
  → Supabase (Postgres, Auth, RLS, RPCs SECURITY DEFINER)
```

O APK não empacota o bundle: carrega a versão publicada. Logo, **toda mudança de
frontend só chega ao aparelho depois de publicar a web**.

## O que você NÃO deve reconstruir

- Não refatorar o SOS (Checkpoint 1B) nem as RPCs relacionadas.
- Não refatorar a autenticação nativa (PKCE + deep link) — está validada em aparelho.
- Não editar migrations já aplicadas em `supabase/migrations/`.
- Não trocar o roteador: é TanStack Router baseado em arquivos; nunca react-router.
- Não mexer em `src/integrations/supabase/*` (gerado) nem em `src/routeTree.gen.ts`.
- Não alterar branding, layout, `applicationId`, versionCode/versionName sem pedido.
- Não adicionar nem remover funcionalidades por conta própria.
- Não colocar secrets no repositório.

## Checkpoint SOS 1B (intacto)

Hold de 3 s → GPS novo → validação (fix < 60 s, precisão ≤ 500 m, cooldown 15 s)
→ `request_id` → server fn → RPC `sos_open` → `sos_events` → fila
`whatsapp_notifications` → Meta Cloud API (ou fallback `wa.me`).
`sos_events` é somente leitura para o app; o frontend nunca faz INSERT/UPDATE/DELETE.
Um SOS ativo por usuário, idempotente por `request_id`.
Arquivos: `src/lib/sos-client.ts`, `src/lib/coords.ts`, `src/hooks/useSosController.ts`,
`src/components/Sos*.tsx`, `src/lib/sos.functions.ts`, `src/lib/sos.server.ts`.

## Auth Android (validado fisicamente)

Custom Tab → Google OAuth → `/auth/callback?native=1&cc=<challenge>` → servidor
guarda a sessão e devolve **código opaco** → deep link
`com.motoanjo.app://auth/callback?code=...` → `appUrlOpen` **e** `getLaunchUrl`
(cold start) → `handleNativeAuthUrl` idempotente → troca do código pela sessão →
guard libera `/dashboard`. Nenhum token trafega na URL.
Arquivos: `src/lib/native-auth.ts`, `src/lib/native-auth.functions.ts`,
`src/lib/native.ts`, `src/routes/auth.callback.tsx`, `src/hooks/useAuth.ts`,
`src/routes/_authenticated/route.tsx`.

## APK v3 e GitHub Actions

`.github/workflows/android-debug.yml` ("Android Debug APK (v3)"):
checkout → Node 22 → JDK 21 → Android SDK → `npm ci` → testes → typecheck →
build web → `mkdir -p android/app/src/main/assets` → `npx cap sync android` →
`./gradlew assembleDebug` → SHA-256 → artifact `moto-anjo-debug-v3`.
Execução #3 terminou com sucesso. **Não remova `android/app/src/main/assets/.gitkeep`.**

## Supabase

Tabelas principais: `profiles`, `emergency_contacts`, `sos_events`,
`whatsapp_notifications`, `trips`, `community_posts/comments/likes/alerts`,
`live_locations`, `location_shares`, `partners`, `user_roles`, `native_auth_codes`.
Papéis ficam em `user_roles` + `has_role()` — nunca no perfil.
Toda tabela nova em `public` precisa de `GRANT` + RLS + policies na mesma migration.

## Bug atual e prioridade

**P0 — mapa-base preto no Dashboard do APK Android.** Auth funciona, Dashboard
abre, marcador e componentes aparecem, mas os tiles do Google Maps não renderizam.
Investigue `src/components/RealMap.tsx` e a chave
`VITE_GOOGLE_MAPS_BROWSER_KEY` (fallback gerenciado só vale em `*.lovable.app`).
Diagnostique com `chrome://inspect` no WebView, procurando
`RefererNotAllowedMapError`, `InvalidKeyMapError`, `ApiNotActivatedMapError` ou
billing. Detalhes em `HANDOFF_MOTO_ANJO.md` §6.
Depois do P0, siga `NEXT_STEPS.md` na ordem.

## Como validar qualquer mudança

```sh
npm ci && npm test && npm run typecheck && npm run build
npx cap sync android
cd android && chmod +x gradlew && ./gradlew assembleDebug
```
Os 105 testes precisam continuar passando.
