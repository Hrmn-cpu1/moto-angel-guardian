# PLANO DE TESTE ANDROID — RC2

O Samsung deixou de ser o alvo: ele foi só o primeiro aparelho de validação. O
alvo agora é **Android como plataforma**, API 23 a 36. Este plano é escrito
para uma pessoa não técnica executar em qualquer aparelho.

Cada teste tem uma etiqueta:

- **AUTOMATED** — já roda em `npm test`, não precisa de aparelho
- **EMULATOR** — dá para verificar em emulador
- **DEVICE** — precisa de aparelho de verdade

Se você tiver mais de um aparelho, rode os testes 01, 02 e 10 em cada um e
anote o modelo e a versão do Android. É assim que a matriz de compatibilidade
deixa de ser teoria.

Antes de começar: aplique as duas migrations novas no Supabase e publique o
app. Sem as migrations, os testes 3 a 6 vão falhar por motivo errado.

Alguns testes precisam de **duas contas** (dois celulares, ou um celular e um
navegador em aba anônima). Estão marcados com **[2 CONTAS]**.

---

## TESTE 01 — O app abre e o mapa aparece  **[DEVICE]**

1. Abra o Moto Anjo.
2. Espere a Home carregar.

**Esperado:** tela escura, mapa com ruas visíveis, sua posição no centro,
nenhum erro.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 02 — A permissão não pergunta de novo  **[DEVICE]**

1. Com a localização já permitida, veja a Home com o mapa.
2. Toque em **Alertas**.
3. Toque em **Perfil**.
4. Volte para a **Home**.
5. Repita a ida e volta três vezes.

**Esperado:** o mapa aparece direto todas as vezes. A tela "Precisamos da sua
localização" **não** pode reaparecer nenhuma vez.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 03 — Permissão bloqueada oferece as Configurações  **[DEVICE]**

1. Configurações do aparelho → Aplicativos → Moto Anjo → Permissões →
   Localização → **Negar**.
2. Abra o Moto Anjo e vá para a Home.

**Esperado:** aparece "Libere a localização nas configurações" com o botão
**Abrir configurações**. Se o botão não conseguir abrir, aparece o passo a
passo escrito — não pode ficar um botão que não faz nada.

3. Volte a permitir a localização nas Configurações.
4. Volte para o app.

**Esperado:** o mapa volta sozinho, sem precisar fechar e abrir o app.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 04 — SOS abre e vira alerta na comunidade

1. Cadastre pelo menos um contato de emergência.
2. Na Home, segure o botão SOS por 3 segundos.

**Esperado:** o SOS abre, aparece o painel com o contato e o horário.

3. Vá em **Alertas**.

**Esperado:** aparece **SOS ativo — Motociclista precisa de ajuda**, com
horário e distância. Deve aparecer **uma única vez**.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 05 — Acionar de novo não duplica

1. Com o SOS ainda ativo, segure o botão SOS de novo por 3 segundos.
2. Volte para **Alertas** e puxe a lista para atualizar.

**Esperado:** continua **um** SOS ativo. Nunca dois.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 06 — Cancelar apaga o SOS do mapa

1. Cancele o SOS pelo painel.
2. Vá em **Alertas** e atualize.

**Esperado:** o "SOS ativo" some da lista e do mapa. Não pode sobrar SOS
fantasma.

3. Repita abrindo um SOS e usando **Encerrar/resolver** em vez de cancelar.

**Esperado:** mesma coisa — some da lista.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 07 — **[2 CONTAS]** O outro motociclista vê o SOS

1. Conta A abre um SOS.
2. Conta B, em um raio de até 25 km, abre **Alertas**.

**Esperado:** a conta B vê o SOS. Deve aparecer só o **primeiro nome** de A —
nunca telefone, nunca e-mail, nunca nome completo.

3. Conta A cancela.
4. Conta B atualiza.

**Esperado:** o SOS some para a conta B.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 08 — **[2 CONTAS]** Aparecer para outros motoqueiros

1. Nas duas contas, vá em **Compartilhamento**.
2. Deixe o interruptor **Aparecer para outros motoqueiros** DESLIGADO nas duas.
3. Ligue o compartilhamento de localização nas duas.
4. Na conta B, ligue a camada de motoqueiros no mapa.

**Esperado:** a conta A **não** aparece para B (elas não são contatos
autorizados uma da outra).

5. Na conta A, LIGUE "Aparecer para outros motoqueiros".
6. Na conta B, atualize o mapa.

**Esperado:** agora A aparece, com o primeiro nome apenas.

7. Na conta A, DESLIGUE o compartilhamento de localização.
8. Na conta B, atualize.

**Esperado:** A some, mesmo com o opt-in ligado — o compartilhamento é o
interruptor mestre.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 08B — **[2 CONTAS]** Contato autorizado não depende do opt-in

Este teste existe porque a correção do opt-in não podia destruir o recurso
antigo de acompanhar um contato.

1. Na conta A, **DESLIGUE** "Aparecer para outros motoqueiros".
2. Ligue o compartilhamento de localização em A.
3. Faça B pedir acesso à localização de A, e A aprovar (tela de
   Compartilhamento).
4. Na conta B, veja o mapa.

**Esperado:** A aparece para B como **contato**, mesmo com o opt-in
comunitário desligado. O rótulo no canto do mapa deve falar em "contato".

5. Em um terceiro aparelho ou conta C, sem autorização nenhuma, veja o mapa.

**Esperado:** A **não** aparece para C.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 09 — Posição velha não aparece

1. Conta A com opt-in e compartilhamento ligados.
2. Feche o app de A completamente e espere **15 minutos**.
3. Conta B atualiza o mapa.

**Esperado:** A não aparece mais — posição vencida sai do mapa.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 09A — O toggle é o mesmo nas duas telas

1. Na **Home**, procure o bloco de botões do lado direito do mapa (Trânsito,
   Áreas de risco, Apoio, Centralizar).

**Esperado:** existe também **"Outros motoqueiros"**, no mesmo estilo dos
outros, e ele começa **desligado**.

2. Ligue na Home.
3. Vá para **Perfil → Mapa seguro**.

**Esperado:** lá o botão "Outros motoqueiros" também está **ligado**.

4. Desligue no Mapa seguro e volte para a Home.

**Esperado:** na Home está desligado. É a mesma preferência, não duas.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 09B — O botão "Outros motoqueiros"

1. Abra a tela do **Mapa**.

**Esperado:** no canto superior direito existem **dois botões, um embaixo do
outro**: "Outros motoqueiros" e "Seguindo/Livre". Os dois precisam estar
visíveis e clicáveis — antes eles ficavam um em cima do outro e o de baixo não
dava para tocar.

2. Toque nele.

**Esperado:** ele acende. Se houver motociclistas com opt-in por perto, os
pinos aparecem e o rótulo no canto inferior passa a contar "na comunidade".

3. Toque de novo para desligar.

**Esperado:** os pinos da comunidade somem. **Seus contatos autorizados
continuam aparecendo** — eles não dependem desse botão.

4. Feche o app completamente e abra de novo. Volte ao Mapa.

**Esperado:** o botão está como você deixou.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 09C — **[2 CONTAS]** O SOS aparece, mesmo sem tempo real

Depois desta versão, o aviso de SOS de outra pessoa **não chega mais
instantaneamente** — isso é proposital, para não publicar a posição de quem
está em emergência num canal aberto.

1. Conta B fica com a tela de **Alertas** aberta.
2. Conta A aciona o SOS.
3. Espere sem tocar em nada.

**Esperado:** o SOS aparece para B em até cerca de 45 segundos. Se você trocar
de aba e voltar, ele aparece na hora.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 09D — Compartilhar localização continua funcionando

Esta versão mudou por dentro como o app grava sua posição. O comportamento
visível tem que ser o mesmo.

1. Vá em **Compartilhamento** e **ligue** o compartilhamento de localização.
2. Espere alguns segundos e veja o horário da última sincronização.

**Esperado:** liga normalmente e o horário atualiza sozinho.

3. **Desligue** o compartilhamento.
4. Feche o app, abra de novo e volte à tela.

**Esperado:** continua desligado. Não pode voltar ligado sozinho.

5. Ligue de novo, feche o app e reabra.

**Esperado:** continua ligado.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 10 — Abrir no Google Maps  **[DEVICE]**

Teste os **quatro** botões, um por um — todos passam pela mesma ponte agora:

1. Tela do Mapa → **Abrir no Google Maps**.

**Esperado:** abre o aplicativo do Google Maps, ou o navegador com o mapa.
**Não** pode aparecer `ERR_UNKNOWN_URL_SCHEME`, tela branca, nem o app travar.

2. Volte para o Moto Anjo com o botão voltar do Android.

**Esperado:** o Moto Anjo continua onde estava, sem recarregar do zero.

3. Tela do Mapa → toque num pino de apoio (hospital, posto) → **Rota**.
4. Tela do Mapa → toque num parceiro → **Rota**.
5. Tela de Alertas → num alerta qualquer, toque em **Ver**.

**Esperado nos quatro:** abre o Google Maps ou o navegador, nunca
`ERR_UNKNOWN_URL_SCHEME`, nunca tela branca, nunca a tela do Moto Anjo virando
o Google Maps por dentro.

[ ] PASSOU  [ ] FALHOU

Observação/print: ______________________________________________

---

## TESTE 11 — Nada regrediu no que já funcionava

Marque um por um:

[ ] Entrar com o Google funciona
[ ] Entrar com e-mail e senha funciona
[ ] O mapa da Home aparece com ruas
[ ] O mapa em Perfil → Mapa seguro aparece
[ ] Contatos de emergência abrem e salvam
[ ] O SOS abre (teste 04)
[ ] O cancelamento funciona (teste 06)
[ ] O histórico lista o SOS
[ ] Sair da conta funciona

Observação/print: ______________________________________________

---

## O que este plano NÃO testa

Não existe no RC2 e portanto não deve ser testado: navegação com rota e
manobras, funcionamento com a tela apagada, tela de bloqueio, detecção de
queda, e receber destino do iFood ou de outro app. Nada disso foi
implementado neste ciclo.

**Nunca teste queda derrubando a moto.**


---

## TESTE 12 — Aparelho pequeno e aparelho grande  **[EMULATOR]**

Ainda não foi feita a revisão responsiva completa (checkpoint F2). Este teste
serve para MEDIR o que falta, não para aprovar.

Em um emulador, abra o app em cada tamanho e anote o que quebra:

| Tamanho | Aparelho típico | Passou? | O que quebrou |
|---|---|---|---|
| 320×568 | telefone antigo pequeno | [ ] | |
| 360×800 | telefone comum | [ ] | |
| 412×915 | telefone grande | [ ] | |
| 768×1024 | tablet | [ ] | |

Olhe especificamente: o botão SOS fica atrás da barra de navegação? O texto
dos botões de baixo corta? Os controles do mapa viram uma coluna gigante? No
tablet, o conteúdo fica preso numa faixa estreita no meio?

**Resultado esperado hoje: vai quebrar em alguma coluna.** Isso é o
levantamento do próximo checkpoint, não uma falha do que foi entregue.

---

## O que este plano NÃO testa

Não existe no código e portanto não deve ser testado: rastreamento com o app
fechado, tela de bloqueio, detecção de queda no aparelho (o motor existe e é
testado por software, mas não há captura de sensor ainda), rota com manobras,
e receber destino de outro aplicativo.

**Nunca teste queda derrubando a moto.**
