# Mapa preto — teste de isolamento (P0)

Status: **causa ainda NÃO confirmada em aparelho.** Este pacote entrega o
instrumento de medida, não a correção. Nenhuma refatoração foi feita.

## O que mudou neste pacote

| Arquivo | Mudança | Risco |
|---|---|---|
| `src/routes/map-debug.tsx` | **novo** — página temporária `/map-debug` | nenhum (rota isolada, pública, `ssr: false`) |
| `src/components/RealMap.tsx` | **3 palavras `export`** em `DARK_STYLE`, `RISK_BANDS` e `loadGoogleMaps` | nenhum (zero mudança de comportamento; diff de 3 linhas) |

Nada foi tocado em Auth, PKCE, deep link, SOS, migrations, Supabase, RLS ou
WhatsApp. Testes: **105/105 passando** (rodados neste pacote).

## Como rodar (2 minutos, só no celular)

1. Publique o app.
2. Abra `https://moto-angel-guardian.lovable.app/map-debug` no Chrome do Samsung.
3. Comece no **Nível 0** com **Layout A**. Suba um nível de cada vez.
4. Depois volte ao **Nível 0** e troque para **Layout B**.
5. Toque em **Coletar diagnóstico** → **Copiar relatório** e me mande o texto.

## O que cada eixo do teste separa

**Níveis (0 → 7).** O nível 0 é literalmente
`new google.maps.Map(container, { center, zoom: 15, mapTypeId: ROADMAP })` —
sem `styles`, sem `backgroundColor`, sem trânsito, sem círculos, sem POIs, sem
alertas, sem riders, sem parceiros, sem overlay nenhum. Cada nível acima
reativa **uma** camada, na ordem pedida. O primeiro nível que apagar o mapa é o
culpado.

**Layouts (A e B).** Este eixo é o que a investigação anterior nunca fez.

- **Layout A** — container com `height: 320px` próprio.
- **Layout B** — reproduz exatamente a estrutura de CSS que o Dashboard usa
  hoje: pai com `min-h-screen` (ou seja, **sem `height`**) e filho com
  `h-full`, que é como o `RealMap` monta o container.

Se o mapa aparecer em A e ficar preto em B, a causa é **altura de container**,
não o Google Maps, não a chave, não o WebView e não o `DARK_STYLE`.

## O relatório mede

- chave presente e de qual origem (**o valor nunca é exibido**);
- `script maps/api/js` no DOM, `window.google.maps`, versão da API;
- `gm_authFailure`, `tilesloaded`, `idle`, `bounds_changed` com o tempo de cada;
- tamanho real do container e de 10 ancestrais, com `position`, `display`,
  `height`, `background`, `opacity`, `filter`, `mix-blend-mode`, `z-index`,
  `overflow`, `visibility` e pseudo-elementos `::before`/`::after`;
- `document.elementsFromPoint` no centro do mapa — se o elemento do topo da
  pilha estiver **fora** do container, existe camada cobrindo os tiles;
- `.gm-style`, número de `<img>`/`<canvas>`, e da primeira tile:
  `naturalWidth/Height`, tamanho renderizado, `max-width`, `opacity`,
  `visibility`, `display`;
- mensagens do Google capturadas de `console.error`/`console.warn`
  (o celular não tem DevTools).

## Depois do teste

Me mande o relatório do nível/layout onde apagou. A correção sai depois disso,
cirúrgica, no ponto exato — e como é web, não precisa de APK novo.
