# ESTADO PARA A PRÓXIMA SESSÃO

## Onde paramos

Pacote `moto-anjo-RC2-ANDROID-GODMODE.zip`. **248/248 testes.** Migrations
**não aplicadas**. Árvore limpa, nada pela metade.

## Primeiro comando da próxima sessão

```bash
npm test          # confirmar 248/248 no ponto de partida
git log --oneline -5
```

## As três coisas que valem mais, em ordem

### 1. Fazer o CI rodar (destrava tudo)

O `android.yml` nunca executou. Ele é a única forma de saber se `targetSdk 36`
compila, se o typecheck passa e se o APK sai. **Faça um push e olhe o
resultado.** Se algum plugin travar em 36, o CI diz qual, e o número volta
para 35 sem drama.

Sem isso, tudo abaixo é escrito no escuro.

### 2. Aplicar as migrations e regerar os tipos

Ordem: 29 primeiro (já deixa o banco seguro sozinha), depois 30. Rode a
verificação em SQL do `RC2-MIGRATIONS-FINAL.md`, principalmente:

- logado como outro usuário, `select * from community_alerts` não pode
  devolver SOS de terceiro;
- `presence_touch` preserva `sharing` nas duas direções;
- `nearby_alerts` com centro de outro estado devolve o que está perto de você.

Depois: regerar `src/integrations/supabase/types.ts`, **apagar
`src/lib/db-novo.ts`** e migrar os dois chamadores
(`useRiderVisibility`, `useNearbyRiders`, `presence`, `useLiveShare`).

### 3. Camada nativa Android (o maior bloco restante)

Foreground service de localização, lock screen e process death. **Não foi
feito aqui de propósito:** Kotlin que não compila neste ambiente teria risco
alto de quebrar o único pipeline que funciona. Comece depois que o CI estiver
verde, e faça um passo por vez com o CI como prova.

O motor de queda (`src/lib/crash-detection.ts`) já está pronto e testado — ele
só espera um adaptador que entregue `AmostraSensor`.

## O que existe e está testado

| Item | Estado |
|---|---|
| SOS manual | validado em aparelho (P0.2) |
| SOS comunitário, riders, gate de permissão, navegação externa | código pronto, testes passando, falta banco + aparelho |
| Motor de detecção de queda | pronto, 24 cenários sintéticos |
| Migrations atômicas | 29 segura sozinha, com teste |
| CI gate | escrito, nunca executado |

## O que não existe

Foreground service, background, lock screen, process death, navegação com
rota, responsividade completa, intent-filter para receber destino, e iOS.
Nenhum deles tem esqueleto ou stub fingindo existir.

## Armadilha que já me pegou três vezes

Testes estruturais que leem arquivos precisam **ignorar comentários**. Um
comentário que descreve o bug antigo (`#fafafa`, `absolute right-3 top-3`,
`nao spoofavel`) é lido como se fosse código e reprova o arquivo já corrigido.
Use `semComentarios` (SQL) e `semComentariosTs` (TS/JSX), que já estão em
`src/lib/rc2-estrutural.test.ts`.

## Aviso sobre conteúdo de autoria desconhecida

Já aconteceu **duas vezes** de aparecer arquivo no repositório que não veio
desta linha de trabalho: a migration `20260810230000_sos_p02_...` (removida) e
um teste de retenção em `rc2-estrutural.test.ts` que, além de não ser meu, era
**autocontraditório** — nenhuma implementação poderia satisfazê-lo. Foi
corrigido. Se aparecer algo que você não reconhece, desconfie antes de aceitar.
