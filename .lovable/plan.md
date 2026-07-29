## Objetivo
Substituir o mapa estilizado por um mapa real do **Mapbox GL JS**, exibindo a localização real do motociclista, seguindo o motociclista em tempo real e pontos de apoio (POIs) próximos.

## Passos

### 1. Conectar o Mapbox
- Ativar o conector Mapbox (in-chat) para provisionar:
  - `VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN` (browser — Mapbox GL JS)
  - `MAPBOX_API_KEY` (server — geocoding e busca de POIs via gateway)

### 2. Instalar dependência
- `mapbox-gl` (e types via `@types/mapbox-gl` se necessário)

### 3. Componente de mapa (browser-only)
Criar `src/components/RealMap.tsx`:
- Import dinâmico do `mapbox-gl` + CSS
- Estilo escuro `mapbox://styles/mapbox/dark-v11` combinando com a identidade preto/dourado
- Marker dourado personalizado para o motociclista
- Recentrar/seguir com botão "crosshair"
- Animação suave (`flyTo`) ao capturar posição
- Marcadores customizados por tipo de POI (hospital/posto/oficina/anjo) com ícones lucide dourados

### 4. Server function para POIs reais
Criar `src/lib/pois.functions.ts` com `createServerFn` que:
- Recebe `{ lat, lng, radius }`
- Chama o gateway Mapbox `/geocoding/v5/mapbox.places` (category search) para tipos: hospital, gas_station, motorcycle
- Retorna lista tipada `{ id, name, type, lat, lng, distance }`

### 5. Refatorar `src/routes/map.tsx`
- Substituir SVG estilizado por `<ClientOnly><RealMap /></ClientOnly>`
- Mostrar skeleton com aparência premium enquanto carrega
- Painel inferior com POI selecionado + botão "Rota no Google Maps" (abre navegador nativo)
- Manter botões "Compartilhar localização" e "Recentrar"

### 6. Integração com SOS
- Adicionar mini-preview do mapa (RealMap sem controles) na tela de SOS após ativação, mostrando o ponto exato

## Detalhes técnicos
- Mapbox GL JS carregado apenas no cliente via `React.lazy` + `<ClientOnly>` para evitar quebrar SSR (`window` não existe no worker)
- Public token vai no browser; chamadas de geocoding/POI passam pelo gateway com secret token (nunca expor `sk.`)
- Watch de posição (`navigator.geolocation.watchPosition`) opcional atrás de toggle "Seguir minha posição"
- Estilo do mapa: dark-v11 + camada custom para reforçar tom dourado nas ruas principais
- Fallback: se token público não estiver configurado, mostrar mensagem "Mapa indisponível" em vez de crashar

## O que NÃO muda nesta etapa
- Rota de navegação turn-by-turn (fica para depois se pedir)
- Rastreamento contínuo pós-SOS compartilhável (frente separada)
- Feed da Comunidade