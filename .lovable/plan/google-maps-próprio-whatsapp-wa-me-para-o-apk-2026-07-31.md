# Google Maps próprio + WhatsApp (wa.me) para o APK

## Objetivo
Deixar o app pronto para rodar como APK Android: mapa funcionando com uma chave sua do Google (a chave gerenciada da Lovable só vale em `*.lovable.app`) e SOS/compartilhamento abrindo o WhatsApp instalado no celular, sem depender da API da Meta.

## Parte 1 — Google Maps com chave própria

Como você ainda não tem a chave, o primeiro passo é um guia que eu te dou no chat; o código já fica preparado para recebê-la assim que você criar.

Guia (eu te acompanho passo a passo):
1. Criar um projeto no Google Cloud e ativar o faturamento (obrigatório mesmo no uso gratuito).
2. Ativar as APIs: Maps JavaScript API e Places API (New).
3. Criar uma chave de API.
4. Restrições de referrer: `https://moto-angel-guardian.lovable.app/*`, `https://*.lovable.app/*` e, quando houver domínio próprio, `https://seudominio.com/*` e `https://*.seudominio.com/*`. Para o APK em WebView Capacitor, incluir também `https://localhost/*` e `http://localhost/*`.
5. Salvar a chave no app como `VITE_GOOGLE_MAPS_BROWSER_KEY`.

Mudanças no código:
- `src/components/RealMap.tsx` passa a usar `VITE_GOOGLE_MAPS_BROWSER_KEY` quando existir, com a chave gerenciada da Lovable apenas como reserva.
- Manter o modo de fallback atual (coordenadas ao vivo + botão "Abrir no Google Maps") para quando a chave falhar.
- Mensagem do fallback mais clara: distinguir "chave não configurada" de "domínio não autorizado", dizendo o que corrigir.
- A busca de pontos próximos (hospitais, postos, oficinas) continua pelo servidor, sem mudanças.

## Parte 2 — WhatsApp via wa.me (sem API da Meta)

Aplicado ao SOS do mapa, à tela de SOS e ao compartilhamento de localização:
- Ao acionar o SOS, o evento continua registrado no banco (histórico e painel admin seguem funcionando).
- Em vez do envio automático pela Cloud API, o app abre o WhatsApp com a mensagem pronta: alerta de emergência + link `https://www.google.com/maps?q=lat,lng`.
- Vários contatos: a tela lista os contatos e cada um vira um botão "Enviar no WhatsApp" (o WhatsApp não permite abrir vários chats de uma vez).
- Um único contato: abre direto o chat dele.
- Sem contatos: abre o seletor de compartilhamento do celular com a mensagem.
- No Android/Capacitor o link `wa.me` abre o app nativo do WhatsApp.

## Detalhes técnicos
- `RealMap.tsx`: ordem da chave → `import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY` → `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`; manter `loading=async` + callback e o hook `gm_authFailure`.
- `MapSosButton.tsx` e `routes/_authenticated/sos.tsx`: continuar chamando `triggerSos` (registro no banco) e trocar `dispatchSosNotifications` por links `waLink()` de `src/lib/phone.ts`.
- `src/lib/sos.server.ts` (Cloud API da Meta) permanece no projeto, mas deixa de ser chamado — sem custo nem token.
- Links abertos com `window.open(url, "_blank", "noopener,noreferrer")`.

## O que ainda depende de você
- Criar a chave no Google Cloud e me passar para salvar como segredo; sem ela o mapa no APK continua no modo fallback (GPS e SOS funcionam normalmente).