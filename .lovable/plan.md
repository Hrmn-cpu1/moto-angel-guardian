# MOTO ANJO — Análise do app + caminho até a Play Store com monetização

## Parte 1 — Análise: o que está bom

- **Base de testes sólida**: 31 arquivos de teste cobrindo SOS, GPS, telefone, rota, navegação bloqueada, login Google e camadas do mapa. Build e verificação de tipos passam limpos.
- **Segurança**: nenhuma senha ou chave secreta está no código. As regras de acesso ao banco estão ativas nas tabelas críticas, e o SOS valida coordenada, precisão e evita disparo duplicado.
- **Desempenho do mapa**: um único rastreador de GPS, marcadores atualizados sem recriar tudo, e limpeza correta ao sair da tela — nada de vazamento.
- **Design consistente**: paleta e espaçamentos centralizados, alturas de botão dentro do recomendado para toque (46–50 px), e respeito às áreas seguras do celular (notch e barra de gestos) nas telas principais.
- **Telas honestas**: quando não há dado, o cockpit mostra "—" ou "calculando" em vez de inventar número. Loading, erro e permissão negada têm tela própria.
- **Acessibilidade no cockpit**: textos ocultos para leitor de tela e rótulos nos controles críticos (status do GPS, finalizar viagem, cancelar destino).

## Parte 2 — Análise: falhas

### Graves (bloqueiam publicar com segurança)
1. **Nada foi provado em aparelho real.** GPS em movimento, tela bloqueada, SOS ponta a ponta, login no APK — tudo passou só em teste de código. Para um app de emergência, isso é o risco número um.
2. **O app é uma casca que depende de internet.** O APK carrega o site publicado; sem rede, o app inteiro cai — inclusive o botão de SOS.
3. **Não existe versão assinada.** Só há build de teste. Sem chave de assinatura e sem AAB, não dá para enviar à loja.

### Médias
4. **Login pode escapar para a tela de login** numa corrida entre o retorno do Google e a checagem de sessão.
5. **Sem recálculo de rota confirmado em campo** — se sair do caminho, a manobra pode ficar errada (o mecanismo foi implementado, mas não validado no aparelho).
6. **Viagem não se recupera** se o Android matar o processo.
7. **Alguns avisos de código** em Dashboard e Mapa (dependências de efeito faltando) que podem causar dados desatualizados na tela.
8. **"Planos pagos — em breve"** aparece na tela de administração — anúncio de algo que não existe.

### Menores
9. **Dois arquivos gigantes**: Mapa (1.294 linhas) e Dashboard (723 linhas) concentram lógica demais — difícil de manter.
10. **Cores escritas à mão** fora do sistema de design nos gráficos do admin e em alguns botões — se a paleta mudar, esses pontos ficam para trás.
11. Sem trava de tela ligada durante navegação, sem confirmação de entrega do WhatsApp, backup do app sem regras de exclusão.
12. Contraste de cores nunca foi medido (avaliação foi visual, não numérica).

## Parte 3 — O que falta para virar APK na Play Store que monetiza

### A. Release assinado (obrigatório)
- Gerar **keystore de release** (fora do repositório) e configurar `assembleRelease` / `bundleRelease`.
- A loja exige **AAB**, não APK.
- Incrementar `versionCode` a cada envio (hoje: 12).
- CI gera o AAB assinado usando segredos do GitHub.
- Ativar **Play App Signing** (Google guarda a chave; recuperável se perder).

### B. Compliance da loja (onde mais se reprova)
- **Política de privacidade em URL pública** — a página já existe no app; basta publicar e apontar na ficha.
- **Justificativa de localização** — não usamos localização em segundo plano (decisão já tomada), o que simplifica a revisão.
- **Formulário de segurança de dados**: localização, contatos, telefones de emergência.
- **Classificação de conteúdo** (questionário).
- **Teste fechado obrigatório**: contas novas precisam de **12+ testadores por 14 dias** antes da produção.
- Ficha: descrição, screenshots, ícone 512, imagem de destaque 1024x500.
- Conta de desenvolvedor: **US$ 25** (taxa única, paga por você ao Google).

### C. Monetização — decisão sua
Regra importante: **apps na Play que vendem recursos digitais são obrigados a usar o Google Play Billing.** Stripe ou Paddle para desbloquear recursos do app Android reprova na revisão.

Modelos:

| Modelo | Observação |
|---|---|
| **Assinatura premium** (recomendado) | Receita recorrente; melhor encaixe |
| Compra única | Simples, sem recorrência |
| Grátis + anúncios | Combina mal com app de emergência |

Proposta de divisão (ajustável):
- **Grátis**: SOS manual, mapa, contatos de emergência, navegação.
- **Premium**: detecção automática de queda, compartilhamento em tempo real, histórico e telemetria completos, navegação na tela bloqueada.

Implementação: integrar Google Play Billing, tela "Seja Premium", restauração de compra e travas nos recursos premium. Você cria os produtos no Play Console — eu passo os IDs exatos.

## Ordem sugerida

1. Corrigir as falhas médias de código (login, avisos de efeito, remover "em breve").
2. Adicionar tela de emergência offline mínima (SOS funciona sem internet).
3. Testes físicos no aparelho: GPS, tela bloqueada, SOS ponta a ponta.
4. Keystore + AAB assinado no CI.
5. Google Play Billing + tela Premium + travas.
6. Ficha da loja + formulários + política publicada.
7. Teste fechado (14 dias) → produção.

## O que preciso que você decida

- Modelo de monetização (recomendo assinatura premium).
- O que fica grátis vs premium.
- Preços (sugestão: R$ 14,90/mês, R$ 119,90/ano).
- Já tem conta Google Play Developer ou vai criar?
- Quer que eu comece pelas correções de código (item 1) ou direto pelo caminho da loja (item 4)?

## Detalhes técnicos

- Keystore nunca entra no git; fica em segredos do CI.
- Play Billing exige AAB no Play Console com produtos criados para testar compras.
- Nada disso altera SOS, RLS, migrations ou OAuth já validados.
