# NEXT STEPS — MOTO ANJO

Ordem obrigatória. Não pular P0.

## P0 — AGORA: mapa-base preto no Samsung

- **Arquivos**: `src/components/RealMap.tsx`, `.env` / `.env.example`, `capacitor.config.ts` (só leitura), `src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/map.tsx`.
- **Dependências**: acesso ao Google Cloud Console (Maps JavaScript API ativa, billing habilitado, chave com referrer `https://moto-angel-guardian.lovable.app/*`); Samsung com depuração USB para `chrome://inspect`.
- **Riscos**: mexer no carregamento do mapa pode afetar `MapSosButton` — **não alterar `useSosController` nem o guard de auth**. Chave sem restrição só para diagnóstico, nunca em produção.
- **Critério de aceite**: no APK, Dashboard e `/map` renderizam tiles do Google Maps com o tema escuro, marcador do usuário visível, console sem `*MapError`, e o fallback `gm_authFailure` **não** dispara.

## P1 — GPS em movimento real

- **Arquivos**: `src/hooks/useGeolocation.ts`, `src/hooks/useRideTelemetry.ts`, `src/components/Speedometer.tsx`, `src/components/LeanGauge.tsx`.
- **Dependências**: P0 concluído (validar sobre o mapa), permissão de localização precisa concedida.
- **Riscos**: consumo de bateria; leituras erráticas em túnel; `watchPosition` pausado em background.
- **Critério de aceite**: 15 min de trajeto real com posição acompanhando a via, velocidade coerente com o painel da moto (±5 km/h) e sem travamento da UI.

## P1 — SOS físico ponta a ponta

- **Arquivos**: `src/hooks/useSosController.ts`, `src/lib/sos-client.ts`, `src/lib/sos.functions.ts`, `src/lib/sos.server.ts`, `src/components/SosPanel.tsx`, `src/routes/_authenticated/sos.tsx`, `src/routes/_authenticated/history.tsx`.
- **Dependências**: pelo menos um contato de emergência cadastrado; `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` configurados com template aprovado pela Meta.
- **Riscos**: enviar alerta real a terceiros — usar um número de teste próprio; não criar SOS duplicado (a idempotência já protege, mas confira `request_id`).
- **Critério de aceite**: hold 3 s → 1 linha em `sos_events` (status `active`) → `whatsapp_notifications` com `status=sent` e `delivered_at` preenchido → mensagem recebida no aparelho do contato → cancelar grava `cancelled_at` → o evento aparece em `/history`.

## P1 — Contatos de emergência

- **Arquivos**: `src/hooks/useContacts.ts`, `src/routes/_authenticated/contacts.tsx`, `src/lib/phone.ts`.
- **Dependências**: sessão autenticada; RLS `emergency_contacts` já restrita ao dono.
- **Riscos**: normalização de telefone brasileiro (DDI/DDD/nono dígito) errada quebra o envio do WhatsApp.
- **Critério de aceite**: adicionar/editar/remover, marcar principal e ver o número normalizado em E.164 usado pela fila do SOS.

## P2 — Localização em background

- **Arquivos**: novo serviço nativo, `android/app/src/main/AndroidManifest.xml`, `src/hooks/useLiveShare.ts`, `live_locations`.
- **Dependências**: `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION`, notificação persistente, plugin de background geolocation.
- **Riscos**: política da Play Store para localização em background exige justificativa e vídeo; bateria; fabricantes (Samsung) matam serviços.
- **Critério de aceite**: com o app minimizado por 10 min, `live_locations.updated_at` continua avançando e o contato aprovado vê a posição.

## P2 — Push notifications Android

- **Arquivos**: `android/app/google-services.json` (novo), `android/app/build.gradle`, `capacitor.config.ts`, nova server function de envio.
- **Dependências**: projeto Firebase, `@capacitor/push-notifications`, token por dispositivo em nova tabela.
- **Riscos**: mexer no Gradle pode quebrar o workflow do APK; permissão `POST_NOTIFICATIONS` no Android 13+.
- **Critério de aceite**: push de teste recebido com o app fechado e abrindo na tela correta.

## P2 — Release assinado (APK/AAB)

- **Arquivos**: `android/app/build.gradle` (`signingConfigs`), `.github/workflows/` (novo job release), secrets do GitHub.
- **Dependências**: keystore gerada e guardada em secret base64; nunca no repositório.
- **Riscos**: perder a keystore inviabiliza atualizações na Play Store.
- **Critério de aceite**: `./gradlew bundleRelease` gera AAB assinado, instalável e verificável com `apksigner verify`.

## P3 — Play Store / compliance / produção

- **Arquivos**: `src/routes/privacy.tsx`, `src/routes/terms.tsx`, ficha da loja, `PROJECT_STATUS.md`.
- **Dependências**: conta de desenvolvedor, política de privacidade pública (já existe em `/privacy`), Data Safety declarando localização e contatos.
- **Riscos**: reprovação por localização em background ou por app "webview wrapper" — reforçar funcionalidade nativa antes de submeter.
- **Critério de aceite**: build de produção aprovada em teste interno da Play Store com Data Safety aceita.
