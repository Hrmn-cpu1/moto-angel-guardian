## Situação atual

Lovable Cloud já está ativo. Autenticação Supabase, tabelas `profiles`, `emergency_contacts`, `trips`, `sos_events` com RLS já funcionam — persistência real e sincronização entre dispositivos já existem hoje. Falta apenas o envio automático de SMS aos contatos quando o SOS é acionado.

## O que vou implementar

### 1. Conector GatewayAPI
Conectar o GatewayAPI ao projeto (você escolhe a conexão / cria uma nova no card que abrir). Ele expõe `GATEWAYAPI_API_KEY` no servidor e é chamado via gateway Lovable, sem lidar com tokens direto.

### 2. Server function `trigger_sos`
Nova função em `src/lib/sos.functions.ts` protegida por `requireSupabaseAuth`:
- Recebe `{ latitude, longitude, address?, note? }` do cliente.
- Insere linha em `sos_events` como o usuário logado (RLS).
- Lê o perfil (nome, telefone) e todos os `emergency_contacts` do usuário.
- Monta mensagem curta:
  `SOS Moto Anjo — {nome} precisa de ajuda. Local: https://maps.google.com/?q={lat},{lng}. {nota opcional}`
- Envia SMS via `POST /mobile/single` para cada contato (loop com `Promise.allSettled`, sender `MotoAnjo`, reference = `sos_event_id`).
- Retorna `{ eventId, sent: n, failed: [{contactId, reason}] }`.
- Falhas por contato não abortam o SOS — o evento já foi registrado.

### 3. Tela SOS
`src/routes/sos.tsx` passa a chamar `trigger_sos` no fim do hold de 3s (via `useServerFn`), mostra estado "Enviando alerta…", depois confirma quantos contatos foram notificados e lista falhas se houver. Botão de compartilhar link manual permanece como fallback.

### 4. Histórico
`useHistory` já lê `sos_events` — nenhuma mudança necessária, os novos eventos aparecem automaticamente.

## Não incluso (fora do escopo desta mensagem)
- E-mail, WhatsApp, chamadas.
- Rastreamento em tempo real depois do SOS (só a coordenada do momento do acionamento).
- Cancelamento/atualização de status do evento (fica para próximo passo, se quiser).

## Detalhes técnicos
- Todo o envio ocorre no servidor via `createServerFn` — `LOVABLE_API_KEY` e `GATEWAYAPI_API_KEY` nunca vão ao browser.
- Números dos contatos serão normalizados para dígitos-only com código de país (E.164 sem `+`) antes de enviar; contatos sem telefone válido são pulados e reportados como falha.
- Sender alfanumérico `MotoAnjo` funciona na maioria dos países; alguns (ex.: EUA) exigem número — nesses casos o SMS pode falhar e aparecerá na lista de falhas.
- Custo do SMS é cobrado na conta GatewayAPI conectada.
