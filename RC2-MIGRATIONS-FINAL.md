# RC2 — MIGRATIONS (final, pré-primeira-aplicação)

## ORDEM SEGURA — mudança desta versão

A migration 29 passou a fazer **o endurecimento de `live_locations` ANTES** de
ligar o SOS comunitário. O motivo: se a 30 falhasse, o banco ficaria num
estado onde o SOS de terceiros já está exposto mas a presença ainda aceita
escrita direta. Isso não é aceitável nem por um minuto.

**Ordem interna da 29:**

1. `sharing DEFAULT false`
2. `REVOKE INSERT, UPDATE, DELETE` de `authenticated`
3. policy `live location own select`
4. `presence_touch` (com rate limit de 5 s e anti-teleporte de 400 km/h)
5. `set_location_sharing`
6. `purge_stale_presence`
7. **só então** `community_alerts`, o trigger de espelho e `nearby_alerts`

**Depois da 29 sozinha, o banco está seguro.** A 30 acrescenta apenas a camada
de riders (`share_with_riders`, `online_riders`, `trusted_contacts_online`) e
pode falhar sem deixar buraco. Há três testes de regressão que falham se essa
ordem for quebrada.

# RC2 — MIGRATIONS

Duas migrations novas. Nenhuma migration aplicada foi editada. Nenhuma
duplica outra.

| Ordem | Arquivo | Checkpoint | Objetos tocados |
|---|---|---|---|
| 29 | `20260811120000_rc2b_sos_comunitario.sql` **(v4)** | RC2-B | `community_alerts` (3 colunas, 2 constraints, 2 índices, 3 policies), `sos_sync_community_alert()` (nova), trigger `trg_sos_sync_community_alert` (novo), `nearby_alerts()` (corpo) |
| 30 | `20260811120100_rc2c_riders_optin.sql` **(v4)** | RC2-C | `profiles.share_with_riders` (nova), índice parcial, `online_riders()` (corpo), `trusted_contacts_online()` (nova) |

## Versões pré-primeira-aplicação

As duas migrations **nunca rodaram em banco**. Por isso foram corrigidas no
lugar, em vez de empilhar migrations de correção sobre migrations que ninguém
executou — o que deixaria o histórico contando uma história de defeitos que o
banco jamais viu. Cada correção está marcada no cabeçalho do arquivo com o
código do hotfix (P0.3, P0.4, P0.5) e o motivo.

A partir da primeira aplicação isso muda: qualquer ajuste passa a exigir
migration nova e aditiva.

**Novidades da v4 (P0.5-A):**

| Objeto | Mudança |
|---|---|
| `presence_touch()` | **nova.** Registra a posição do viewer. Escreve só a própria linha, valida lat/lng, recusa `0,0`, preserva `sharing` e cria a primeira linha com `false` |
| `live_locations.sharing` | `DEFAULT true` → **`DEFAULT false`** |
| `nearby_alerts`, `online_riders`, `trusted_contacts_online` | origem passa a ser a posição recente do viewer; `_lat`/`_lng` seguem na assinatura mas não decidem o centro |

O `DEFAULT` da coluna era `true`: qualquer inserção que esquecesse a coluna
publicaria a posição da pessoa por omissão. Mudar isso não altera linha
existente nenhuma.

## Política de retenção de localização (v5)

A partir do P0.5, quem apenas consulta alertas passa a ter a própria posição
registrada no servidor. Isso exige política explícita — está aqui, e precisa
entrar também na política de privacidade publicada.

**Qual dado.** Uma linha por conta em `public.live_locations`: `lat`, `lng`,
`speed_kmh`, `heading`, `sharing`, `updated_at`. Uma linha só, sobrescrita —
não há histórico de trajeto.

**Para quê.** Autorizar consultas de proximidade sem confiar no centro
enviado pelo cliente, e publicar a posição para contatos e comunidade quando
(e só quando) `sharing` estiver ligado.

**Presença privada × publicação.** São coisas diferentes e não se confundem:

| | `sharing = false` | `sharing = true` |
|---|---|---|
| Quem vê | ninguém além do dono | contatos autorizados e, com opt-in, a comunidade |
| Como é criada | `presence_touch` ao consultar alertas | escolha explícita do usuário |
| Serve para | autorizar proximidade | aparecer no mapa dos outros |

**Por quanto tempo é operacional.** A posição só conta como "recente" por
15–30 minutos (é o TTL das RPCs). Depois disso ela não serve mais para nada
funcional — fica apenas ocupando espaço e representando risco.

**Purga proposta (revista).** `purge_stale_presence(_days integer DEFAULT 30)`
faz duas coisas diferentes, porque os dois casos são diferentes:

| Caso | Ação | Por quê |
|---|---|---|
| `sharing = false` vencida | linha apagada | não há preferência a preservar: `false` já é o padrão |
| `sharing = true` vencida | **coordenada descartada** (`0,0`), preferência mantida | a linha guardava duas coisas; só uma delas ainda importa |

Uma coordenada de semanas atrás não serve para nada — o TTL operacional é de
15 a 30 minutos. Guardá-la só porque o último booleano era `true` seria usar
posição como armazenamento de preferência. Zerar para `0,0` é descarte de
verdade: todas as RPCs recusam Null Island, então a linha nunca reaparece até
chegar posição nova. Só `service_role`
executa. **Agendar é passo de operação e ainda não foi feito:** pg_cron
(`select cron.schedule('purge-presence','0 4 * * *', $$select
public.purge_stale_presence(30)$$)`) ou um job externo diário. Enquanto não
houver agendamento, a função existe mas ninguém a chama — e isso precisa
aparecer como pendência, não como resolvido.

**Direito do titular.** Apagar a própria linha é hoje um pedido ao suporte:
`authenticated` perdeu `DELETE` na tabela no P0.6-A. Se a exclusão sob demanda
virar requisito de LGPD, cabe uma RPC `forget_my_location()` — não
implementada nesta versão.

## O que NÃO foi tocado

`sos_open`, `sos_cancel`, `sos_resolve` — validadas fisicamente no Samsung no
P0.2 e deliberadamente fora do alcance destas migrations. Há um teste que
falha se alguma delas for redefinida na migration B.

`20260811090000_sos_rpc_ambiguidade_coluna.sql` continua sendo a única
migration de ambiguidade. Existe um teste que falha se
`20260810230000_sos_p02_ambiguidade_coluna.sql` reaparecer.

## 29 — RC2-B, SOS comunitário

**Motivo.** Um SOS ativo precisa existir na camada comunitária, e essa
sincronização tem que ser garantida pelo banco.

**Decisão.** Trigger em `sos_events`, não reescrita das RPCs. Cobre qualquer
caminho de escrita (RPC, `service_role`, correção manual) e não coloca em
risco código já validado.

**Idempotência.** `ux_community_alerts_sos_event` — índice único parcial sobre
`sos_event_id`. Um evento, no máximo um alerta. Retry do mesmo `request_id`
não chega a criar evento novo, então não há inserção nova; corrida cai em
`ON CONFLICT ... DO NOTHING`.

**Ciclo de vida.** `cancelled` → alerta `cancelled`; `resolved`/`notified` →
`resolved`; qualquer outro status final → `expired`. `nearby_alerts` só
devolve `status = 'active'`.

**Privacidade (corrigida na v3 — P0.4-A).** O alerta carrega posição, horário
e vínculo, e `nearby_alerts` expõe somente o primeiro nome. Mas isso não
bastava: a migration original de `community_alerts` tinha

```sql
CREATE POLICY "alerts readable by authenticated"
  ON public.community_alerts FOR SELECT TO authenticated USING (true);
```

Com o espelho do SOS na mesma tabela, qualquer autenticado poderia pular a RPC
e ler a posição exata de quem acionou o SOS. Policy nova:

```sql
CREATE POLICY "alerts select scoped" ON public.community_alerts
  FOR SELECT TO authenticated
  USING (sos_event_id IS NULL OR auth.uid() = user_id);
```

Alerta manual continua legível por autenticados; espelho de SOS, só pelo dono.
Terceiros passam obrigatoriamente por `nearby_alerts()`, que é
`SECURITY DEFINER` e portanto não passa por RLS.

**Limites de servidor (P0.4-B).** `nearby_alerts`: raio 1–50 km, janela
1–24 h, validação de lat/lng e recusa de Null Island. Origem inválida devolve
lista vazia.

**Efeito no Realtime.** O Realtime respeita RLS, então o evento de um SOS de
terceiro deixa de chegar por `postgres_changes`. O SELECT **não** foi reaberto
para compensar: `useAlerts` reconsulta a RPC segura a cada 45 s, com
`refetchIntervalInBackground: false`.

**Aditiva?** Sim. Sem `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` ou `DELETE`. As
três policies de `community_alerts` são substituídas por versões que mantêm
exatamente o que já era permitido para os quatro tipos manuais e fecham só o
espelho do SOS.

**Idempotente ao reaplicar?** Sim: `ADD COLUMN IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, constraints protegidas por `IF NOT EXISTS`,
`CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS` antes de criar, backfill com
`ON CONFLICT DO NOTHING`.

**Rollback conceitual.**
```sql
drop trigger trg_sos_sync_community_alert on public.sos_events;
drop function public.sos_sync_community_alert();
-- e reaplicar o corpo anterior de nearby_alerts (migration 20260731075416).
-- Colunas e índice podem ficar: são inertes sem o trigger.
```

## 30 — RC2-C, riders com opt-in (v2)

**Motivo.** O produto pede um interruptor "aparecer para outros motoqueiros".
Até aqui, `online_riders` só devolvia contato autorizado.

**Correção da v1, antes da primeira aplicação.** A v1 somava o opt-in ao
caminho de contato com `OR`, e isso furava o requisito: um contato autorizado
aparecia na camada comunitária mesmo com o opt-in desligado. Comunidade
pública e relação privada agora são duas funções:

| Função | Regra |
|---|---|
| `online_riders()` | `auth` + não-self + `sharing = true` **E** `share_with_riders = true` + posição recente + raio |
| `trusted_contacts_online()` | `auth` + não-self + `sharing = true` **E** `is_trusted_contact()` + posição recente + raio |

`sharing ON` + opt-in `OFF` → não aparece na comunidade.
`sharing ON` + opt-in `ON` → aparece.
`sharing OFF` + opt-in `ON` → não aparece, em nenhuma das duas.

O `JOIN` em `profiles` é interno de propósito: com `LEFT JOIN`, um perfil
ausente escaparia do filtro de opt-in.

**Decisão.** Coluna booleana em `profiles`, default `false`. O caminho de
contato autorizado, que já existia antes do RC2, continua idêntico — só mudou
de endereço.

**Limites de servidor (v3 — P0.4-B).**

| Função | Raio | Tempo |
|---|---|---|
| `online_riders` | 1–50 km | TTL 1–15 min |
| `trusted_contacts_online` | 1–100 km | TTL 1–30 min |

A camada pública é mais apertada de propósito: descobrir desconhecidos merece
janela menor que acompanhar um contato autorizado. As duas validam lat/lng e
recusam `0,0`. Os tetos ficam acima do que a UI usa (50 km / 10 min), então o
contrato atual não muda.

**Aditiva?** Sim. Uma coluna com default, um índice parcial e
`CREATE OR REPLACE` de funções `LANGUAGE sql` com a mesma assinatura e as
mesmas colunas de retorno.

**Idempotente ao reaplicar?** Sim.

**Rollback conceitual.**
```sql
drop function public.trusted_contacts_online(double precision, double precision, double precision, integer);
update public.profiles set share_with_riders = false;
-- e reaplicar o corpo anterior de online_riders (migration 20260731130155).
```

## Verificação em banco

Nada aqui foi executado contra Postgres: este ambiente não tem rede nem
acesso ao banco. Os testes provam que as regras estão escritas e ligadas, não
que o Postgres as aceitou.

**DB VALIDATION REQUIRED** — depois de aplicar, conferir:

1. `select count(*) from public.community_alerts where type = 'sos';`
2. abrir um SOS e conferir que nasceu exatamente 1 alerta;
3. cancelar e conferir `status = 'cancelled'` no alerta;
4. `select * from public.nearby_alerts(-23.96,-46.30,25,12);` — o SOS
   cancelado não pode aparecer;
5. com `share_with_riders = false`, o usuário não pode aparecer em
   `online_riders` **nem para um contato autorizado**;
6. com `share_with_riders = false` e contato autorizado, o usuário **deve**
   aparecer em `trusted_contacts_online`;
7. com `sharing = false`, não aparece em nenhuma das duas;
8. **teste do vazamento:** logado como usuário B, rodar
   `select * from public.community_alerts;` — nenhuma linha com
   `sos_event_id` de outra pessoa pode voltar. Alertas manuais devem voltar
   normalmente;
9. `select * from public.nearby_alerts(-23.96,-46.30,99999,99999);` — o
   resultado precisa respeitar 50 km / 24 h, não o que foi pedido;
10. `select * from public.online_riders(0,0,50,10);` — Null Island devolve
    lista vazia;
11. **anti-varredura:** sem chamar `presence_touch`, qualquer chamada a
    `nearby_alerts` deve vir vazia. Depois de `presence_touch`, deve vir o que
    está perto de você — mesmo passando um centro de outro estado;
12. **sharing preservado:** `update live_locations set sharing = true where
    user_id = auth.uid();` → chamar `presence_touch` → conferir que continua
    `true`. Repetir com `false`;
13. **primeira linha:** apagar a própria linha, chamar `presence_touch` e
    conferir `sharing = false`.
