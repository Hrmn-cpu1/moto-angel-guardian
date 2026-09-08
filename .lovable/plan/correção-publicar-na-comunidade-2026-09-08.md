# Correção: publicar na Comunidade

## O que foi verificado

- Tela: `src/routes/_authenticated/community.tsx` (botão "Publicar" → função `publish`).
- Tabela real usada: `community_posts` (mesma tabela lida pelo feed, via a função `community_feed`).
- Permissões e regras de acesso: a permissão de gravação existe e a regra "só publica em nome de si mesmo" está ativa; a leitura do feed está liberada para quem está logado.
- Banco hoje: **zero publicações gravadas** — ou seja, nenhum envio chegou a ser salvo até agora.

## Causa raiz

A função de publicar falha em silêncio. Três pontos concretos no mesmo trecho:

1. `if (!text.trim() || !user) return;` — se o perfil do usuário ainda não carregou (ou falhou ao carregar), o clique não faz absolutamente nada, sem aviso. O botão continua clicável e o formulário fica igual.
2. O retorno de erro do banco é guardado numa variável e simplesmente ignorado: `if (!error) { ... }`. Qualquer recusa (sessão expirada, regra de acesso, campo inválido, rede) desaparece sem mensagem e sem registro no console.
3. Após o envio não há recarga da lista: o feed depende só do aviso automático em tempo real. Se esse canal não chegar, a publicação não aparece mesmo quando é salva.

O feed também engole o erro da consulta: quando a leitura falha, a tela mostra "Nenhuma publicação" como se estivesse tudo certo.

## Correção proposta (sem mudar o visual)

Arquivo: `src/routes/_authenticated/community.tsx`

- Validar antes de enviar: texto obrigatório (mín. 2 caracteres) e sessão ativa; cada caso com mensagem própria no formulário.
- Ler a sessão real no momento do envio (`supabase.auth.getUser()`) e usar esse identificador como autor — assim o envio funciona mesmo se o perfil ainda estiver carregando; o nome exibido continua vindo do perfil quando disponível.
- Fazer o envio retornando o registro criado (`.insert(...).select().single()`), aguardando confirmação do banco.
- Tratar o erro por tipo, com texto claro para o usuário e `console.error` com o detalhe técnico:
  - sessão/autenticação inválida → "Sua sessão expirou. Entre novamente."
  - recusa por regra de acesso → "Sem permissão para publicar com esta conta."
  - campo obrigatório/valor inválido → "Confira os campos e tente novamente."
  - falha de rede → "Sem conexão. Tente novamente."
- Só após confirmação: inserir o registro retornado no topo da lista, recarregar o feed do banco, limpar o formulário e fechar o compositor.
- Feedback visível de sucesso: "Publicação realizada", exibido por alguns segundos.
- Botão com estado de carregando ("Publicando…"), desabilitado durante o envio, com trava contra duplo clique (mesma trava usada em outros formulários do app).
- O formulário só é limpo depois do sucesso — nunca antes.
- Mostrar erro de carregamento do feed em vez de "Nenhuma publicação", com botão "Tentar novamente".

## Verificação

- Novo teste de comportamento `src/routes/community-publish.behavior.test.tsx`: envio com sucesso atualiza a lista e mostra confirmação; erro de regra de acesso mostra mensagem e mantém o texto digitado; duplo clique envia uma única vez; sem texto não envia.
- Rodar a suíte completa, verificação de tipos, lint e build.
- Conferir no banco que a linha realmente existe em `community_posts` após o teste no navegador, e que ela permanece após recarregar a tela.

## Detalhes técnicos

- Tabela: `public.community_posts`; regras envolvidas: `cp_insert` (gravar apenas com o próprio identificador) e `cp_select` (leitura liberada a usuários autenticados); leitura agregada via função `community_feed`.
- Atualização da lista por `queryClient.setQueryData` (imediata, com o registro retornado) seguida de `invalidateQueries(["community","feed"])`; o canal em tempo real existente continua funcionando como reforço.
- Nenhuma migração de banco é necessária — o esquema e as permissões já estão corretos.
