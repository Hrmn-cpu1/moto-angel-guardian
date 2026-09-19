# DAISY AI — Copiloto Inteligente de Segurança do Moto Anjo

## Identidade oficial

**DAISY**  
Copiloto inteligente de segurança para motociclistas.

> "Estou aqui para ajudar você a chegar em segurança."

**MOTO ANJO • UM POR TODOS E TODOS POR UM**

## Princípio arquitetural

A DAISY é a interface inteligente do Moto Anjo, mas **não é a fonte única de segurança**.

Fluxo conceitual:

sensores + GPS + viagem + comunidade + SOS
→ **motor determinístico de segurança**
→ eventos confiáveis
→ **DAISY**
→ voz / explicação / orientação / solicitação de fluxo autorizado

Regras de emergência, temporizadores, cancelamento de SOS e detecção nativa devem continuar funcionando sem depender de um modelo generativo ou de uma conexão permanente com a internet.

A DAISY nunca deve inventar um evento, afirmar que uma rota é segura ou declarar que um serviço público foi acionado quando isso não foi efetivamente confirmado.

## Capacidades planejadas

1. **Comandos de voz** — iniciar/parar viagem, consultar destino, abrir funções e pedir ajuda.
2. **Protocolo 1 — situação de ameaça** — iniciar o fluxo discreto de segurança definido pelo aplicativo e pelos consentimentos do usuário.
3. **Possível queda/acidente** — interpretar o evento determinístico produzido pelo motor nativo e conduzir a confirmação por voz.
4. **Navegação assistida** — contextualizar rota, desvios e alertas disponíveis.
5. **Alertas preventivos** — comunicar riscos reportados com nível de confiança e atualidade.
6. **Ajuda mútua** — coordenar pedidos entre participantes autorizados e próximos.
7. **Coordenação de emergência** — organizar localização e dados autorizados; chamadas automáticas somente quando houver integração realmente implementada e testada.
8. **Análise de ocorrências** — classificar sinais e inconsistências sem transformar relatos não confirmados em fatos.
9. **Monitoramento da viagem** — acompanhar eventos relevantes da viagem segundo as preferências e consentimentos do usuário.
10. **Assistente do aplicativo** — explicar recursos e responder perguntas curtas, especialmente por áudio durante a pilotagem.

## Voz

Idioma inicial: **pt-BR**  
Perfil: feminina, natural, calma, curta e objetiva.

Exemplos:

- "Olá, Oliveira. Viagem segura iniciada. Estou acompanhando sua rota."
- "Atenção. Há um acidente reportado à frente. Reduza com segurança."
- "Detectei uma possível queda. Você está bem? Responda para cancelar o alerta."
- "Há um pedido de ajuda próximo. Você está disponível para ajudar?"

A voz deve evitar diálogos longos durante a pilotagem.

## Estados da DAISY

A implementação deve trabalhar com estados explícitos, por exemplo:

- idle
- listening
- processing
- speaking
- monitoring_trip
- safety_alert
- emergency_confirmation
- offline

O estado da DAISY nunca deve substituir o estado real da proteção nativa.

## Prioridade de confiança

Quando houver conflito entre uma resposta generativa e uma fonte determinística:

**motor nativo / estado real > servidor e dados confirmados > dados comunitários classificados > modelo generativo.**

O modelo pode explicar, resumir e orientar o usuário. Ele não pode autorizar sozinho uma ação crítica que o sistema não confirmou.

## Fases

### Fase 1 — MVP

- comando de voz;
- respostas curtas por voz;
- iniciar/parar viagem;
- consultar destino;
- ativar fluxo SOS;
- receber evento de possível queda;
- perguntar "Você está bem?";
- respeitar timeout e cancelamento definidos pelo motor de segurança;
- funcionamento degradado quando a IA estiver indisponível.

### Fase 2 — Copiloto

- contexto de navegação;
- alertas comunitários classificados;
- priorização de eventos;
- sugestões de desvio;
- ajuda mútua contextual;
- memória somente do contexto necessário para a viagem e com consentimento.

### Fase 3 — Inteligência avançada

- análise de padrões de risco;
- personalização controlada;
- detecção de inconsistências;
- melhoria da priorização de alertas;
- coordenação mais inteligente da rede de ajuda.

## O que NÃO deve ser feito

- Não colocar o SOS atrás de uma chamada a LLM.
- Não depender de IA para detectar fisicamente uma queda.
- Não afirmar que SAMU/Polícia foi acionado sem confirmação real.
- Não apresentar informação comunitária não confirmada como fato.
- Não manter gravação de áudio contínua sem necessidade e consentimento apropriado.
- Não enviar localização para terceiros fora das regras de compartilhamento autorizadas.
- Não permitir que uma resposta generativa contorne permissões, RLS, autenticação ou regras de segurança.

## Estado atual

Este documento define a arquitetura e o produto planejado da DAISY. **Não significa que as dez capacidades já estejam implementadas.**

Antes de marcar qualquer capacidade como pronta, ela deve ter implementação, teste automatizado quando aplicável e validação ponta a ponta no ambiente de produção.

## Critério de pronto da DAISY

Uma capacidade só é considerada pronta quando:

1. existe implementação real no aplicativo/servidor/native quando necessário;
2. existe tratamento de erro e indisponibilidade;
3. existe teste automatizado para a lógica crítica;
4. o comportamento é seguro quando a internet ou a IA falha;
5. permissões e privacidade estão explícitas;
6. o fluxo foi validado em dispositivo Android real de forma segura;
7. o comportamento observado corresponde ao que a DAISY anuncia ao usuário.
