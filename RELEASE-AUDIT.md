# RELEASE AUDIT — Moto Anjo RC1

Data: 2026-08-11 · Escopo: auditoria de release, sem novas funcionalidades.

## 1. Commit base analisado

- `cd0c1fc` — *Refactor RealMap component to export constants and functions* (branch `main`).

## 2. Arquivos modificados nesta auditoria

| Arquivo | Natureza |
|---|---|
| `supabase/migrations/20260811090000_sos_rpc_ambiguidade_coluna.sql` | **novo** — migration oficial P0.2, aplicada byte a byte como enviada |
| `src/lib/sos-unificacao.test.ts` | contagem de migrations pré-existentes + 8 testes de regressão da P0.2 |
| `.env.example` | documenta `GOOGLE_MAPS_API_KEY` (servidor) que faltava |
| `src/components/RealMap.tsx` | somente formatação Prettier (nenhuma mudança de lógica/estilo do mapa) |
| `RELEASE-AUDIT.md` | este relatório |

Nenhum outro arquivo de aplicação foi tocado. Identidade visual, fluxo de
navegação, OAuth, mapa, SOS hold-to-fire, WhatsApp, GPS, contatos, histórico,
comunidade, admin e Capacitor estão preservados.

## 3. Bugs encontrados

1. **P0 — `column reference "request_id" is ambiguous` nas RPCs de SOS.**
   Confirmado no banco: as três funções (`sos_open`, `sos_cancel`,
   `sos_resolve`) ainda estavam com o corpo antigo, sem alias de coluna. Em
   PL/pgSQL cada coluna de `RETURNS TABLE` também é variável, então
   `WHERE request_id = _request_id` é recusado em tempo de execução — o SOS
   morria no acionamento real (reproduzido no Samsung).
2. **P2 — variável de ambiente não documentada.** `src/lib/pois.functions.ts`
   lê `GOOGLE_MAPS_API_KEY` (servidor), ausente do `.env.example`. Fora do
   Lovable a busca de pontos de apoio devolveria lista vazia sem explicação.
3. **P2 — testes estruturais quebrariam ao adicionar a P0.2.** Dois testes
   fixavam "23 migrations pré-existentes" e classificavam qualquer arquivo não
   marcado como Checkpoint 1/1B como antigo.

## 4. Bugs corrigidos

1. Migration P0.2 adicionada ao repositório **e aplicada ao banco**. Verificado
   por `pg_get_functiondef`: `sos_open` contém `se.request_id = _request_id`;
   `sos_cancel` e `sos_resolve` contêm `se.status NOT IN (...)`.
2. `GOOGLE_MAPS_API_KEY` documentada no `.env.example`.
3. Testes ajustados para reconhecer a P0.2 como migration nova (a asserção de
   "23 migrations pré-existentes intocadas" continua valendo, agora correta) e
   ampliados com 8 regressões específicas — nenhum teste foi removido ou
   enfraquecido.

## 5. Migrations

- Adicionada: `20260811090000_sos_rpc_ambiguidade_coluna.sql` (ADITIVA — apenas
  `CREATE OR REPLACE` das três funções; sem `DROP`, `ALTER` destrutivo ou
  `TRUNCATE`; assinaturas, nomes de argumento e colunas de retorno idênticos).
- **Não** recriada e comprovadamente ausente: `20260810230000_sos_p02_ambiguidade_coluna.sql`
  (há teste automatizado impedindo o retorno).
- 27 migrations anteriores intactas; nenhuma reescrita. Nenhuma duplicata ou
  migration conflitante encontrada nas 24 pré-existentes + Checkpoint 1/1B.

## 6. Testes e comandos executados

| Comando | Resultado |
|---|---|
| `npm test` | **113/113 aprovados**, 0 falhas |
| `npm run typecheck` | **OK** (`tsc --noEmit`, sem erros) |
| `npm run build` | **OK** (build web + servidor Nitro/Cloudflare) |
| `npm run lint` | **684 erros de formatação Prettier + 11 avisos** — ver abaixo |
| `npx cap sync android` | **não executado neste ambiente** (o SDK Android não está instalado no sandbox; roda no GitHub Actions) |
| `./gradlew assembleDebug` | **não executado neste ambiente** pelo mesmo motivo |

### Lint em detalhe

Todos os 684 erros são `prettier/prettier` (formatação) e nenhum é erro de
lógica, tipo ou regra de React. Concentram-se em 11 arquivos, quase todos
gerados ou de biblioteca: `src/integrations/supabase/types.ts` (gerado),
`src/routes/mcp.ts`, `src/routes/[.mcp]/*`, `src/routes/[.well-known]/*`
(gerados pelo plugin MCP) e componentes shadcn em `src/components/ui/`.
`src/components/RealMap.tsx`, único arquivo de aplicação afetado e tocado pela
correção anterior do mapa, foi formatado nesta auditoria. Os demais foram
deixados como estão para não misturar 600+ linhas cosméticas em um release
candidate. Os 11 avisos são `react-refresh/only-export-components` e
`react-hooks/exhaustive-deps` e são intencionais/benignos. O workflow do
Android não roda `lint`, então isso não bloqueia o APK.

## 7. Status por área

- **SOS (P0)** — preservados e verificados no SQL aplicado: `request_id`,
  idempotência, um único SOS ativo por usuário (índice parcial único),
  `pg_advisory_xact_lock` por usuário, tratamento de `unique_violation`, recusa
  de `request_id` de evento encerrado, fila do WhatsApp com
  `ON CONFLICT DO NOTHING`, cancelamento que cancela a fila, resolução,
  histórico e RLS. O front-end continua sem nenhum INSERT/UPDATE/DELETE direto.
- **Supabase / RLS** — 14 tabelas com RLS habilitado. `native_auth_codes` tem
  RLS sem policies **de propósito**: só o `service_role` (troca PKCE no
  servidor) acessa. Demais tabelas com políticas por `auth.uid()`. As RPCs de
  SOS têm `REVOKE ... FROM public, anon` e `GRANT EXECUTE` só para
  `authenticated`/`service_role`. Os avisos do linter sobre "SECURITY DEFINER
  executável por signed-in users" são o desenho pretendido dessas RPCs.
- **Auth / Google OAuth / deep link** — fluxo Authorization Code + PKCE
  intacto; `com.motoanjo.app://auth` declarado no manifest; `App.getLaunchUrl()`
  no bootstrap; guard respeitando `nativeAuthProcessing`. Nada alterado.
- **Android / Capacitor** — `appId com.motoanjo.app`, `versionCode 3`,
  `versionName 1.2`, `minSdk 23`, `target/compileSdk 35`, modelo WebView com
  `server.url` remoto preservado, permissões INTERNET, ACCESS_NETWORK_STATE,
  ACCESS_FINE/COARSE_LOCATION e queries do WhatsApp presentes.
- **GitHub Actions** — `.github/workflows/android-debug.yml` íntegro: Node 22,
  JDK 21, `npm ci`, testes, typecheck, build web, `mkdir -p android/app/src/main/assets`,
  `cap sync`, `assembleDebug`, SHA-256 e artifact `moto-anjo-debug-v3`.
- **Mapa / GPS / Realtime / comunidade / trips / histórico / notificações / admin**
  — auditados, sem bug comprovado; nenhuma alteração.
- **Imports quebrados** — nenhum: `typecheck` e `build` passam.
- **Arquivos obsoletos** — três componentes sem nenhum importador:
  `src/components/EmergencyButton.tsx`, `src/components/LocationCard.tsx`,
  `src/components/ShareLocationButton.tsx` (o compartilhamento vive hoje em
  `/sharing`). São código morto inofensivo; **não removidos** para não alterar
  nada fora do escopo de estabilidade. Recomendado remover em um passo próprio.
- **Placeholders** — nenhum TODO/FIXME/placeholder em `src/`, `android/` ou
  `.github/`.

## 8. Riscos restantes / pendências

Este pacote é um **release candidate**, não está declarado pronto para
produção. Ainda dependem de teste físico, credencial ou infraestrutura externa:

1. **Samsung — SOS ponta a ponta.** A causa raiz do erro de ambiguidade foi
   corrigida no banco, mas o acionamento real no aparelho ainda não foi
   reexecutado.
2. **Samsung — Google OAuth v3 (PKCE + cold start)** aguarda revalidação física.
3. **Samsung — contraste do mapa** após a correção do `DARK_STYLE` (AMOLED, sol).
4. **GPS em movimento** (precisão, `watchPosition`, consumo).
5. **WhatsApp Cloud API** ponta a ponta: depende de `WHATSAPP_ACCESS_TOKEN` e
   `WHATSAPP_PHONE_NUMBER_ID`. Sem elas o app cai no envio manual `wa.me`.
6. **APK v3** precisa ser gerado pelo GitHub Actions (SDK Android indisponível
   neste ambiente). O APK atual continua válido: o WebView carrega a URL
   publicada, então correções web chegam sem novo APK — mas as mudanças desta
   auditoria são de banco e testes, e **exigem apenas a publicação web**.
7. **Release assinado / AAB / Play Store** ainda não iniciados.
8. **Formatação Prettier** pendente em arquivos gerados e shadcn.
