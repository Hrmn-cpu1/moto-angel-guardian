# RELATÓRIO DE ESTADO — MOTO ANJO (RC2)

Data/hora: 2026-08-12 19:41 UTC · Commit atual: `178a942` (árvore limpa, sem alterações pendentes)

---

## 1. Resumo executivo

O projeto **Moto Anjo** está em estado **Release Candidate RC2**, publicado em produção web (visibilidade pública). O patch RC2 ("GODMODE") foi aplicado sem conflitos, a suíte de testes está em **248/248 PASS**, o typecheck está limpo e o build web/servidor compila. O APK Android está configurado em `versionCode 4 / versionName 1.3.0-rc1` e o pipeline de CI (GitHub Actions) está pronto para gerar APKs.

**Pendências conhecidas (sem bloqueio de release):**
- A migration **RC2-C (`riders_optin`)** existe no repositório mas **não foi aplicada ao banco** — a coluna `share_with_riders` e o índice `idx_profiles_share_with_riders` não existem em `profiles`. Aguarda sua autorização.
- Nenhum APK RC2 foi gerado ainda (workflow pronto, aguardando execução/manual).

---

## 2. Qualidade e builds

| Verificação | Resultado |
|---|---|
| Testes (node --test, 12 arquivos) | **248/248 PASS** (0 falhas, 0 skip) |
| Typecheck (`tsgo --noEmit`) | **Limpo** (exit 0) |
| Build web/servidor | **OK** (validado em sessões anteriores) |
| Working tree git | **Limpa** — `git status` vazio, `git diff --stat` vazio |
| Publicação web | **Publicada, visibilidade pública** |

Arquivos rastreados: 326 · Arquivos em `src/`: 178 · Arquivos de teste: 12

---

## 3. Banco de dados — estado das migrations

30 arquivos de migration no repositório. Verificação funcional no banco:

| Migration | Estado no DB | Evidência |
|---|---|---|
| P0.2 `20260811090000_sos_rpc_ambiguidade_coluna.sql` | **APLICADA ✅** | `sos_open` usa colunas qualificadas (`se.request_id`, `se.user_id`, INSERT com lista explícita de colunas) |
| RC2-B `20260811120000_rc2b_sos_comunitario.sql` | **APLICADA ✅** | Tabela `public.community_alerts` existe; `live_locations` e `profiles` presentes |
| RC2-C `20260811120100_rc2c_riders_optin.sql` | **NÃO APLICADA ❌** | Coluna `share_with_riders` ausente em `profiles`; índice `idx_profiles_share_with_riders` ausente |

Última migration registrada em `supabase_migrations.schema_migrations`: versão `20260811121206` (name `37b0a9e5-...`).

**Tabelas públicas confirmadas no banco:** `sos_events`, `native_auth_codes`, `community_alerts`, `live_locations`, `profiles`, `emergency_contacts`, `whatsapp_notifications` (entre outras).

**Dados de SOS:** 16 eventos totais, 1 ativo.

> Observação: a migration RC2-C é **aditiva** (apenas adiciona uma coluna `boolean` + índice em `profiles`) e não altera os RPCs `sos_open`/`sos_cancel`/`sos_resolve`. Aplicá-la é seguro e não destrói dados existentes.

---

## 4. Segurança / Auth / RLS

- **Auth Android (PKCE + Deep Link):** Implementada em `src/lib/native-auth.ts` e `src/lib/native-auth.functions.ts`. O deep link transporta apenas um `code` opaco (Authorization Code + PKCE, RFC 7636), sem `access_token`/`refresh_token` na URL. `native_auth_codes` é uma tabela efêmera bloqueada por RLS.
- **Route guard:** `src/routes/_authenticated/route.tsx` respeita `nativeAuthProcessing` (aguarda processamento de cold start antes de redirecionar).
- **Funções RPC de SOS:** `sos_open`, `sos_cancel`, `sos_resolve` são `SECURITY DEFINER` com `search_path = 'public'` e permissões restritas. Não há escritas diretas (INSERT/UPDATE/DELETE) no front-end — toda DML passa pelos RPCs.
- **Roles:** Armazenadas em tabela separada (`user_roles`), não em `profiles` (verificado: `profiles` não tem coluna `role`).
- **Google OAuth:** Configurado com `redirect_uri` same-origin (`window.location.origin`).

---

## 5. Android / Capacitor

| Item | Valor |
|---|---|
| `applicationId` | `com.motoanjo.app` |
| `versionCode` | 4 |
| `versionName` | `1.3.0-rc1` |
| Permissões | Internet + Localização em runtime (`AndroidManifest.xml`) |
| Deep link | `com.motoanjo.app://auth/callback` (intent-filter) |
| Auth | Custom Tab + PKCE |

---

## 6. CI/CD — GitHub Actions

Dois workflows em `.github/workflows/`:
- `android-debug.yml` — "Android Debug APK (v3)": checkout → Node 22 → JDK 21 → 248 testes → typecheck → build web → `cap sync` → `gradlew assembleDebug` → SHA-256 → artifact. Disparo: `workflow_dispatch` (manual) ou push em `main` (paths específicos).
- `android.yml` — pipeline auxiliar.

Inclui passo `mkdir -p android/app/src/main/assets` + `.gitkeep` para garantir a pasta de assets no checkout limpo.

---

## 7. Telas / Rotas

Rotas autenticadas (`src/routes/_authenticated/`): admin, alerts, benefits, community, contacts, dashboard, history, map, notifications, profile, ride, sharing, sos, trip.

Rotas públicas: index, intro (boas-vindas institucional), terms, privacy, auth.

Componentes (~20 + biblioteca `ui`): `RealMap` (Google Maps, tema escuro), `SosFab`, `SosHoldButton`, `SosPanel`, `Speedometer`, `LeanGauge`, `LocationPermissionGate`, `AdminCharts` (Recharts), `BottomNavigation`, `HomeTopBar`, etc.

---

## 8. Identidade visual

"Graphite & Gold": preto profundo (#050505/#111111), dourado metálico (#D4AF37/#F3D675), vermelho de emergência (#D92323) reservado para SOS/alertas. Glassmorphism, bordas douradas finas, degradês discretos, tipografia forte. Preservada sem refatorações cosméticas.

---

## 9. Próximos passos sugeridos (aguardando autorização)

1. **Aplicar RC2-C (`riders_optin`) ao banco** — migration aditiva e segura, libera o recurso de opt-in de motoqueiros próximos.
2. **Gerar APK RC2** — executar o workflow "Android Debug APK (v3)" no GitHub Actions (Actions → Run workflow) ou build local.
3. **Validar no Samsung** — confirmar Google Maps renderizando, Auth PKCE completando sessão no cold start, SOS comunitário.

Nenhuma alteração de código é necessária para estabilizar o RC2 atual — o projeto já está em estado releaseable.
