# Nova Home: mapa em tempo real (estilo Waze/Uber)

A Home deixa de ser o painel com cartões e passa a ser o mapa em tela cheia, com barra superior discreta, botão SOS flutuante e a navegação inferior.

## Estrutura da nova tela

```text
+------------------------------------------+
| [foto] Nome · Online   GPS 4G 87%  [sino]|  barra flutuante discreta
|                                          |
|            MAPA DARK EM TELA CHEIA       |
|   você · motoboys online · ocorrências   |
|   heatmap de risco · apoio · parceiros   |
|                                          |
|   [chips: Risco | Motoboys | Apoio]      |  filtros pequenos
|                    (SOS)                 |  botão vermelho pulsante
| Início   Alertas    ·    Amigos    Mais  |  bottom nav
+------------------------------------------+
```

## O que muda

- **Home = mapa**: `/dashboard` passa a renderizar o mapa ocupando toda a área, sem cabeçalho grande e sem os cartões de Proteção ativa, Localização atual e Compartilhar localização.
- **Barra superior**: faixa translúcida sobre o mapa com foto/inicial, nome, status, GPS, bateria, conexão e sino de notificações.
- **Painéis sob demanda**: coordenadas, ponto de apoio, parceiro ou motoboy aparecem em painel pequeno sobre o mapa apenas quando algo é tocado.
- **Atalhos antigos**: viagem, velocímetro, benefícios, contatos, histórico etc. saem da Home e passam para a aba "Mais".
- **Botão SOS**: círculo vermelho grande, com brilho e pulsação lenta, fixo no centro inferior acima da navegação; ativação por toque contínuo de 3 segundos. Ao ativar: registra o SOS, compartilha localização, abre WhatsApp para os contatos e publica uma ocorrência de emergência visível para motoboys próximos. Gravação de áudio fica para etapa futura.
- **Navegação inferior**: Início, Alertas, Comunidade e Mais; o SOS deixa de ser item da barra e vira botão flutuante independente.

## Camadas do mapa

- Sua posição em tempo real (marcador dourado pulsante, centralização automática e zoom conforme velocidade).
- Motoboys online (apenas contatos que compartilham localização, como hoje).
- Ocorrências recentes da comunidade.
- Heatmap de áreas de risco a partir das ocorrências da comunidade e dos SOS registrados dos últimos dias.
- Áreas seguras: hospitais, postos policiais, oficinas, postos de combustível e parceiros.
- Camada de trânsito do Google.
- Chips de filtro para ligar/desligar cada camada.

## Desempenho

- O mapa é criado uma única vez e mantido enquanto o app está aberto; trocar de aba e voltar não recria o mapa.
- Atualizações de GPS e de marcadores acontecem sem recarregar o mapa: marcadores são movidos, não recriados.
- Ocorrências e motoboys atualizam em segundo plano com cache, sem piscar a tela.

## Detalhes técnicos

- `src/routes/_authenticated/dashboard.tsx`: vira a Home-mapa (mapa em tela cheia, `HomeTopBar`, chips, SOS flutuante); os atalhos migram para a tela "Mais" (`profile`).
- `src/components/RealMap.tsx`: adicionar `TrafficLayer`, `HeatmapLayer` (biblioteca `visualization` no loader) e prop `layers` para alternar visibilidade; manter o fallback atual quando a chave do Google falhar.
- Novo `src/components/HomeTopBar.tsx`: perfil e status via `useAuth`/`useGeolocation`, Battery Status API e `navigator.connection`, com degradação silenciosa onde não houver suporte.
- Novo `src/components/SosFab.tsx` (evolução de `MapSosButton`): hold de 3 s, glow/pulso, `triggerSos`, links `wa.me` para contatos e inserção de ocorrência de emergência em `community_alerts` para alertar quem está por perto.
- Heatmap: nova função de banco `risk_heatmap(_lat,_lng,_radius_km,_days)` (security definer, agregando `community_alerts` e coordenadas de `sos_events` sem expor autoria) + hook `useRiskZones`.
- `src/components/BottomNavigation.tsx`: remover o botão central de SOS e distribuir as quatro abas.