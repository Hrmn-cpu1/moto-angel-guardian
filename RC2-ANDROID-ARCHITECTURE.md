# RC2 — ARQUITETURA REAL

Este documento descreve o que existe no código depois dos checkpoints A–E.
O que ainda não existe está na seção final, nomeado, para não virar promessa.

## Visão geral do que está implementado

```
Aparelho (WebView Capacitor, APK casca -> server.url)
        |
        v
  React / TanStack Start
        |
        +-- useLocationPermission ------> location-permission (estado de módulo)
        |                                   |-- Capacitor Geolocation.checkPermissions
        |                                   +-- Permissions API do navegador
        |
        +-- useGeolocation --------------> navigator.geolocation (app aberto)
        |
        +-- useSosController ------------> triggerSos (server function)
        |                                        |
        |                                        v
        |                                   RPC sos_open  [P0.2, intocada]
        |                                        |
        |                                        v
        |                                   sos_events
        |                                        |
        |                     trigger trg_sos_sync_community_alert
        |                                        |
        |                    +-------------------+-------------------+
        |                    v                                       v
        |            community_alerts (type='sos')          whatsapp_notifications
        |                    |                                       |
        |                    v                                       v
        |          RPC nearby_alerts (status='active')      envio manual wa.me
        |          [SECURITY DEFINER: unica porta de                   |
        |           acesso ao SOS de terceiros; o SELECT               |
        |           direto na tabela e fechado por RLS]                |
        |                    |                              (automático: bloqueado,
        |                    v                               ver RC2-RELEASE-AUDIT)
        |          Alertas Próximos + pinos no mapa
        |
        +-- useRiderVisibility ----------> profiles.share_with_riders
        |
        +-- useMapLayers ----------------> localStorage (ver/nao ver)
        |          |    [uma chave so; Home e /map leem a mesma preferencia]
        |          |
        +-- registrarPresenca ----------> RPC presence_touch
        |   publicarPresenca               [UNICA via de escrita da posicao;
        |                                   preserva sharing; 1a linha false;
        |                                   rate limit 5s; anti-teleporte]
        |
        +-- useLiveShare --------------+--> RPC set_location_sharing
        |                             |     [UNICA via de escrita de sharing]
        |                             +--> RPC presence_touch
        |          [authenticated NAO tem INSERT/UPDATE/DELETE em
        |           live_locations; so SELECT da propria linha]
        |          |
        +-- useNearbyRiders -------+----> RPC online_riders
        |                          |       (comunidade: sharing ON E opt-in ON)
        |                          +----> RPC trusted_contacts_online
        |                                  (privado: sharing ON E contato
        |                                   autorizado, sem exigir opt-in)
        |        as duas: posição recente, dentro do raio, nunca o próprio
        |        usuário, só primeiro nome
        |
        +-- external-navigation ---------> plugin nativo (se existir)
                 |                          ou window.open(_blank)
                 +-- normalizarDestino  <-- geo:, lat/lng, URL de mapa,
                                            endereço, deep link motoanjo
```

## Decisões que valem registro

**O SOS comunitário é do banco, não do frontend.** Um trigger em `sos_events`
espelha o evento em `community_alerts`. O frontend nunca insere alerta de SOS
— a RLS o proíbe. Isso elimina a corrida "abriu o SOS mas o alerta não
entrou" e cobre caminhos que não passam pelo app.

**A idempotência é um índice, não um `if`.** `ux_community_alerts_sos_event`
é um índice único parcial sobre `sos_event_id`. Nenhuma lógica de React ou
PL/pgSQL precisa "lembrar" de não duplicar.

**A permissão de localização é estado de plataforma, não de componente.**
`location-permission.ts` mantém a última leitura em escopo de módulo e
notifica assinantes. Trocar de aba não zera nada; voltar para a tela
reconsulta, porque a permissão pode ser revogada em segundo plano.

**Nada navega a WebView para fora.** `external-navigation.ts` é o único ponto
que abre mapa externo, sempre por URL HTTPS universal e sempre fora da
WebView. `intent://` não é construído em lugar nenhum, e o parser recusa
`javascript:`, `data:`, `file:`, `content:` e `intent:`.

**Duas visibilidades, duas funções.** Camada pública e relação privada não
compartilham regra: `online_riders` exige opt-in explícito e `trusted_contacts_online`
exige autorização do dono. Um contato autorizado não fura o opt-in comunitário,
e desligar o opt-in não cega quem você autorizou.

**A porta segura só serve se a janela estiver fechada.** `nearby_alerts()` é
`SECURITY DEFINER` e filtra tudo — mas isso não valia nada enquanto
`community_alerts` tinha `SELECT USING (true)`. A RLS agora esconde o espelho
do SOS de terceiros, e o Realtime, que respeita RLS, deixou de entregar esses
eventos. Em vez de reabrir o SELECT, a UI reconsulta a RPC a cada 45 s
enquanto está em uso. Segurança primeiro; a UI se adapta.

**Limites de servidor.** Raio e janela vindos do cliente são sugestão. Os
tetos vivem no SQL: alertas 50 km/24 h, comunidade 50 km/15 min, contatos
100 km/30 min.

**A origem também é do servidor.** Teto de raio sem origem confiável não
protege nada: bastava mover o centro e varrer o país. As três RPCs de
proximidade usam a posição recente do próprio viewer, gravada por
`presence_touch`. O `CROSS JOIN` com esse bloco é o que fecha a porta — sem
posição recente, zero linhas.

**Registrar presença não é publicar.** `presence_touch` nunca escreve
`sharing`; `set_location_sharing` nunca escreve posição. A separação é
estrutural, não convenção: a tabela perdeu `INSERT/UPDATE/DELETE` para
`authenticated`, então não existe caminho que mande as duas coisas juntas. A
primeira linha nasce privada e o `DEFAULT` da coluna é `false`.

**O que os controles de localização entregam — e o que não entregam.** A
origem das consultas está vinculada à presença recente da conta, com intervalo
mínimo de 5 s e recusa de deslocamento acima de 400 km/h dentro de 30 minutos.
Isso encarece varredura geográfica. **Não** prova onde o aparelho está: GPS é
dado originado no dispositivo, e a primeira coordenada de uma conta vem do
cliente sem verificação possível.

**Ver e aparecer são coisas diferentes.** `share_with_riders` (servidor) é
privacidade e mora em Compartilhamento; a camada do mapa (aparelho) é
visualização e mora no mapa. Camada desligada não consulta o servidor.

**Privacidade por construção nas RPCs comunitárias.** `nearby_alerts`,
`online_riders` e `trusted_contacts_online` devolvem no máximo primeiro nome,
avatar, posição, horário e distância. Telefone, e-mail e nome completo não saem — e há teste que falha
se alguém tentar adicioná-los.

## Camadas do mapa hoje

Trânsito, riders, alertas (agora incluindo SOS), zonas de risco, POIs de
apoio e parceiros. Os POIs dependem de `GOOGLE_MAPS_API_KEY` no servidor e
do gateway do Lovable; sem isso a camada volta vazia em silêncio — segue
como pendência aberta desde a auditoria do RC1.

## O que NÃO existe (não implementado neste ciclo)

| Checkpoint | Situação |
|---|---|
| F — Dark mode auditado | não implementado |
| F2 — responsividade em 7 larguras | não implementado |
| F3 — hierarquia do botão SOS | não implementado |
| G — Moto Anjo Navigation (busca, rota, ETA, manobra) | não implementado; depende de Routes/Directions API com billing |
| G2 — recepção de intent de app externo | o parser existe e está testado; o intent-filter no Android **não** foi criado |
| H — foreground service / background | não implementado |
| H2 — lock screen | não implementado |
| I — crash detection e modo diagnóstico | não implementado |
| J/K — auditoria final e pacote de release | parcial (este ciclo) |

Não há esqueleto, stub nem "adapter" fingindo essas funções. Nada foi
declarado pronto sem código.
