# MOTO ANJO — CHECKPOINT RC4 (2026-08-14)

Documento de handoff. Congela o estado do projeto para continuidade fora do Lovable.
Nada aqui foi inventado: o que não foi executado está marcado como NÃO EXECUTADO.

## A. IDENTIDADE DO BUILD

| Item | Valor |
|---|---|
| Branch | `edit/edt-3e3164b4-ad1b-4de4-8708-d1addfa833da` |
| HEAD | `aa80d0b` |
| applicationId | `com.motoanjo.app` |
| versionCode | 5 |
| versionName | 1.3.2 |
| URL publicada | https://moto-angel-guardian.lovable.app |

Stack: React 19 · TypeScript · Vite · TanStack Start + Router + Query ·
Tailwind CSS v4 · shadcn/ui · Supabase (`@supabase/supabase-js` 2.x) ·
Capacitor 7 (Android) · Google Maps JS API · testes com `node:test`.

## B. ESTADO DOS GATES

| Gate | Estado |
|---|---|
| `npm test` (379 testes) | PASS — 379/379 em 2026-08-14 |
| `tsc --noEmit` (typecheck) | PASS |
| `npm run lint` | FAIL — ~706 problemas históricos de Prettier, anteriores ao RC4; arquivos tocados estão formatados |
| `npm run build` | PASS |
| `npx cap sync android` | PASS |
| Gradle `assembleDebug` | NÃO EXECUTADO |
| APK gerado | NÃO EXECUTADO |
| Teste em aparelho físico | NÃO EXECUTADO |

## C. HOTFIX P0 — INÍCIO DE VIAGEM

**Causa raiz.** No Capacitor 7 os plugins nativos devolvem o handle de
`addListener` de forma SÍNCRONA. O código tratava o retorno sempre como
Promise (`.then`), o que produzia `TypeError: t.addListener(...).then is not a
function` — um throw síncrono que subia até o boundary raiz e derrubava a
aplicação inteira ("This page didn't load") ao iniciar a Viagem Segura.

**Arquivos alterados.**
- `src/lib/trip-service.ts` — normalização do listener e blindagem
- `src/hooks/useTrip.ts` — `.catch()` nas chamadas nativas
- `src/components/RealMap.tsx` — estado controlado de rota indisponível
- `src/lib/hotfix-p0-viagem.test.ts` — 9 testes de regressão

**Estratégia de normalização.** `normalizarHandle()` aceita os dois contratos
(handle direto ou Promise de handle). O registro acontece dentro de uma IIFE
assíncrona com `try/catch`, então um `addListener` ausente, incompatível ou
que lança não escapa para o boundary. Handle inválido é registrado no
diagnóstico e ignorado. O cancelador é sempre uma função válida, mesmo sem
plugin.

**Modo degradado.** Falha do serviço nativo NÃO cancela a viagem:
`iniciarServicoDeViagem` devolve `false` em vez de lançar, e a viagem segue em
primeiro plano, sem notificação persistente. O que se perde é a robustez em
segundo plano, não a funcionalidade.

**REQUEST_DENIED (Directions).** A falha da rota virou estado controlado
(`rotaIndisponivel`): banner "Rota temporariamente indisponível. Seu destino
continua salvo." com botão de nova tentativa. O destino é preservado e o
recálculo pode ser pedido de novo. Nenhum throw sobe para o boundary.

**Estado: CORRIGIDO EM CÓDIGO, NÃO VALIDADO EM APARELHO.**

## D. RC4 VISUAL

- Tokens de espaçamento `--ma-1`…`--ma-8` e alturas de controle
  (`ma-control`, `ma-cta-h`) em `src/styles.css`.
- Utilitários `ma-page`, `ma-sheet`, `ma-modal`, `ma-hero`, `ma-title`.
- Safe areas: âncoras `--ma-top` / `--ma-bottom` derivadas de
  `env(safe-area-inset-top/bottom)`; elementos flutuantes da Home posicionados
  por essas variáveis em vez de valores fixos.
- `100dvh` no lugar de `100vh`/`min-h-screen` (WebView Android com barras
  dinâmicas e teclado).
- Sheets e modais limitados a ~85dvh (`ma-sheet` / `ma-modal`), um sheet
  aberto por vez.
- Botões: GoldButton/OutlineButton — SM 36px, MD 46px, LG 50px.
- Inputs/textarea com altura e tipografia normalizadas; cards com padding 16px.
- Cockpit compactado; `TelemetryStrip` com 58px de altura.
- SOS FAB reduzido de 86px para 72px, ancorado acima da navegação.
- Mapa em tela cheia com estados READY / LOADING / ERROR e retry.
- Viewports conferidas no preview: telas pequenas (360×640), médias (390×844)
  e grandes; sem overflow horizontal (`overflow-x: hidden` global) e sem
  colisão entre SOS, navegação inferior e barra de destino.
- Limitação: os tiles do Google Maps não renderizam no sandbox (chave restrita
  por referrer), então a densidade visual com viagem ativa real ainda precisa
  de conferência no aparelho.

RC4 não tocou em SOS, RLS nem migrations.

## E. ARQUIVOS ALTERADOS RECENTEMENTE

Hotfix P0: `src/lib/trip-service.ts`, `src/hooks/useTrip.ts`,
`src/components/RealMap.tsx`, `src/lib/trip-diagnostics.ts`,
`src/lib/lovable-error-reporting.ts`, `src/components/MapErrorBoundary.tsx`,
`src/lib/hotfix-p0-viagem.test.ts`.

RC4: `src/styles.css`; `src/components/ui/{card,dialog,alert-dialog,sheet,input,textarea}.tsx`;
`src/components/{GoldButton,OutlineButton,Header,EmptyState,AppShell,BottomNavigation,HomeTopBar,DestinationBar,DestinoDialog,MapLayersSheet,RideCockpit,TelemetryStrip,SosFab,SosHoldButton,NextManeuver}.tsx`;
rotas em `src/routes/` (densidade tipográfica e paddings);
`src/lib/rc31.test.ts` (asserção migrada de `env()` para `var(--ma-bottom)`).

## F. PENDÊNCIAS REAIS

### P0 — bloqueiam uso real
1. Validar em aparelho físico o fluxo Home → Iniciar Viagem Segura → Destino →
   Iniciar. O crash está corrigido em código e coberto por teste, mas nunca foi
   reproduzido de novo no aparelho após o hotfix.
2. Directions API retornando `REQUEST_DENIED` na origem publicada: hoje o app
   degrada com elegância, mas **navegação com rota não funciona** até a
   configuração do Google Cloud ser concluída (seção G).

### P1 — Android / background
3. Foreground service da Viagem Segura (`ViagemSeguraService.java`) e
   notificação em tela de bloqueio: implementados, NÃO validados em aparelho.
4. Posição em segundo plano com a tela apagada (ponte `ouvirPosicaoNativa`):
   NÃO validada.
5. Detecção de queda (`src/lib/crash-detection.ts`): coberta por teste
   unitário, sem validação em campo.
6. APK: Gradle nunca rodado neste estado; gerar pelo workflow
   `.github/workflows/android-debug.yml`.
7. O APK é uma casca (`server.url` aponta para o domínio publicado): sem
   internet o app não abre — nem o SOS. Ver `HOSTING-DECOUPLING-PLAN.md`.

### P2 — melhorias
8. ~706 problemas de Prettier históricos no lint.
9. Migrations `rc2b`/`rc2c` (seção H).
10. Desacoplamento de hospedagem (etapas 2 e 3 do plano de hosting).

## G. GOOGLE CLOUD — CONFIGURAÇÃO MANUAL PENDENTE

No projeto Google Cloud da chave usada pelo app:
1. Ativar **Maps JavaScript API**, **Directions API** e **Places API**.
2. Habilitar **billing** no projeto (sem billing, Directions responde
   `REQUEST_DENIED`).
3. Restrição por **referrer HTTP** deve listar:
   - `https://moto-angel-guardian.lovable.app/*` (origem publicada)
   - o domínio customizado, se houver
   - a origem do WebView do APK — que é a mesma origem publicada, porque
     `capacitor.config.ts` usa `server.url`; se um dia o APK passar a servir
     arquivos locais, a origem vira `https://localhost` e a restrição precisa
     acompanhar.
4. Variáveis de ambiente envolvidas (apenas nomes):
   `VITE_GOOGLE_MAPS_BROWSER_KEY` (chave própria, prioritária),
   `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` (fallback, só funciona em
   `*.lovable.app`), `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID`.

Nenhum valor real de chave consta neste repositório de entrega.

## H. SUPABASE — MIGRATIONS

`supabase/migrations/` tem 30 arquivos, em ordem cronológica.

- Aplicadas com evidência nesta linha do tempo: todas até
  `20260811090000_sos_rpc_ambiguidade_coluna.sql` (correção P0.2 de
  ambiguidade de coluna nas RPCs de SOS).
- **Estado desconhecido / provavelmente NÃO aplicadas:**
  `20260811120000_rc2b_sos_comunitario.sql` e
  `20260811120100_rc2c_riders_optin.sql`. Vieram no snapshot RC2 e não há
  registro de execução. Verifique no banco antes de aplicar.

Regra: não editar migration já aplicada; criar uma nova.
Toda tabela nova em `public` precisa de `GRANT` explícito além de RLS.

## I. CONTRATOS QUE DEVEM SER PRESERVADOS

Não altere estes contratos sem uma decisão explícita — o SOS depende deles.

- **Fluxo SOS unificado**: o front-end NÃO faz DML direto em tabelas de SOS.
  Tudo passa pelas RPCs.
- RPCs: `sos_open`, `sos_cancel`, `sos_resolve`, `sos_purge_history`.
  Assinaturas, nomes e semântica são contrato público do cliente
  (`src/lib/sos-client.ts`, `src/hooks/useSosController.ts`).
- **Idempotência**: `sos_open` é idempotente por usuário/evento aberto —
  acionar duas vezes não cria dois eventos. Não remova essa garantia.
- **RLS**: habilitado em todas as tabelas de usuário, com GRANTs
  correspondentes. Nenhuma leitura de dados de terceiro sem política.
- Tabelas/visões cujo shape é consumido pelo app:
  `sos_events`, `community_alerts`, `online_riders`,
  `trusted_contacts_online`.
- WhatsApp: `src/lib/sos.server.ts` usa a Cloud API quando
  `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` existem; sem elas, cai
  no envio manual `wa.me`. As duas devem estar presentes juntas.
- Auth nativo: Auth Code + PKCE via deep link `com.motoanjo.app://auth/callback`.
  Não voltar a transportar token na URL.

## J. PRÓXIMO PASSO PARA O CLAUDE

1. Abrir o ZIP `moto-anjo-RC4-full-source-2026-08-14.zip`.
2. Validar integridade: conferir o SHA-256 informado na entrega.
3. `npm ci && npm test` — esperar 379/379 PASS.
4. `npm run typecheck && npm run build` — ambos PASS.
5. Inspecionar a camada Android (`android/`, `capacitor.config.ts`,
   `ViagemSeguraService.java`, `AndroidManifest.xml`).
6. Completar as pendências P0/P1 desta lista, sem tocar nos contratos da
   seção I.
7. Gerar patch/diff e um novo checkpoint datado.
8. Só então gerar APK — pelo CI (`.github/workflows/android-debug.yml`),
   não à mão.
9. Testar em aparelho físico: viagem, background, tela de bloqueio, SOS.
