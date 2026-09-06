# MOTO ANJO — Do APK debug ao Play Store com monetização

## Visão geral

Hoje o app gera apenas APK **debug** (não assinado para loja). Para chegar à Play Store monetizando faltam 4 frentes: release assinado, compliance da loja, funcionalidades pendentes do roadmap e a monetização em si.

## 1. Release assinado (obrigatório para publicar)

- Gerar **keystore de release** (guardado fora do repositório) e configurar `build.gradle` para `assembleRelease` / `bundleRelease`.
- A Play Store exige **AAB** (Android App Bundle), não APK.
- Incrementar `versionCode` a cada envio (hoje: 12).
- GitHub Actions: job de release que gera o AAB assinado usando secrets (keystore em base64 + senhas).
- Recomendado: ativar **Play App Signing** (Google guarda a chave de assinatura; se perder a de upload, dá para recuperar).

## 2. Compliance da Play Store (etapa que mais reprova)

- **Política de privacidade em URL pública** — a página `/privacy` já existe no app; basta publicar e apontar a URL na ficha da loja.
- **Justificativa de localização** — o app usa GPS; a Play exige declaração do uso. Não usamos `ACCESS_BACKGROUND_LOCATION` (decisão já tomada — o foreground service cobre), o que simplifica muito a revisão.
- **Formulário de segurança de dados** (Data Safety): localização, contatos, telefone dos contatos de emergência.
- **Classificação de conteúdo** (questionário IARC).
- **Teste fechado obrigatório**: contas de desenvolvedor novas precisam rodar um teste fechado com **12+ testadores por 14 dias** antes de liberar produção.
- Ficha da loja: descrição, screenshots, ícone 512, feature graphic 1024x500.
- Conta Google Play Developer: **US$ 25** (taxa única, paga por você direto ao Google).

## 3. Funcionalidades que o roadmap já prevê (NEXT_STEPS)

- **P0/P1 em aberto**: validação física da lock screen (P0.1c segue NOT PROVEN), SOS ponta a ponta, teste com dois aparelhos.
- **P2**: push notifications (FCM) — importante para retenção e para o SOS chegar com app fechado.
- Estes não bloqueiam a publicação, mas um app de segurança publicado com SOS não testado ponta a ponta é risco real.

## 4. Monetização — decisão sua necessária

Modelos possíveis para este app:

| Modelo | Como funciona | Observação |
|---|---|---|
| **Assinatura premium** | Plano mensal/anual libera recursos (ex.: detecção de queda, histórico ilimitado, compartilhamento em tempo real) | Melhor encaixe; recorrente |
| **Compra única** | Paga uma vez, libera tudo | Simples, mas sem receita recorrente |
| **Grátis + anúncios** | Anúncios para usuários free | Combina mal com app de segurança/emergência |

Sobre a tecnologia de pagamento, há uma decisão importante:

- **Apps na Play Store que vendem recursos digitais são obrigados pelo Google a usar o Google Play Billing** (cobrança dentro do app). Não podemos usar Stripe/Paddle para desbloquear recursos do app Android — é contra a política da loja e reprova.
- Stripe/Paddle só seriam opção se a assinatura fosse vendida **fora do app** (site), o que o Google restringe bastante.
- Recomendação: **Google Play Billing** com um plano "Moto Anjo Premium" (mensal + anual), integrado via plugin Capacitor de purchases.

O que eu implementaria nesta etapa de monetização:
1. Definir o que é grátis vs premium (proposta abaixo — ajustável).
2. Integrar Google Play Billing (plugin de in-app purchases para Capacitor).
3. Tela de assinatura ("Seja Premium") + restauração de compra.
4. Gate nos recursos premium conforme o status da assinatura.
5. Você cria os produtos (mensal/anual) no Play Console — eu te passo os IDs exatos.

Proposta inicial de divisão (você decide):
- **Grátis**: SOS manual, mapa, contatos de emergência, navegação.
- **Premium**: detecção automática de queda, compartilhamento de localização em tempo real, histórico e telemetria completos, navegação na tela de bloqueio.

## Ordem sugerida de execução

1. Fechar os testes físicos pendentes (lock screen, SOS) — confiança antes de cobrar.
2. Keystore + AAB assinado no CI.
3. Google Play Billing + tela Premium + gates.
4. Ficha da loja + formulários de compliance + política publicada.
5. Teste fechado (14 dias) → produção.

## O que preciso que você decida

- Modelo de monetização (minha recomendação: assinatura premium via Play Billing).
- O que fica grátis vs premium.
- Preços (ex.: R$ 14,90/mês, R$ 119,90/ano — sugestão).
- Você já tem (ou vai criar) a conta Google Play Developer?

## Detalhes técnicos

- Keystore nunca entra no git; fica em secrets do GitHub Actions.
- Play Billing exige AAB enviado ao Play Console com os produtos criados para testar compras (testers licenciados).
- Nada disso altera SOS, RLS, migrations ou OAuth já validados.
