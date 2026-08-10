# NEXT_STEPS — MOTO ANJO

Ordem de execução. Não iniciar novas funcionalidades fora desta lista.

## P0 — Revalidar o Google Maps no Samsung
Fechar e reabrir o APK v3 (ele carrega o site publicado; não é preciso novo APK).
Aceite: no Dashboard aparecem ruas, avenidas, nomes de vias, contexto geográfico,
marcador do usuário e overlays Moto Anjo. Se ainda escuro, abrir `chrome://inspect`
e conferir `RefererNotAllowedMapError` / `InvalidKeyMapError` / tiles.

## P1 — GPS em movimento real
Percorrer um trajeto e conferir atualização contínua, follow, precisão e velocímetro.

## P1 — SOS físico ponta a ponta
Hold 3 s → `sos_open` → linha em `sos_events` → fila WhatsApp → mensagem recebida →
cancelamento → histórico. Conferir idempotência (não duplicar) e cooldown.

## P1 — Teste com dois usuários/aparelhos
Compartilhamento de localização, aprovação de contato confiável, riders online no mapa.

## P2 — Background location / foreground service
Serviço em primeiro plano com notificação persistente para rastrear com a tela apagada.

## P2 — Push notifications Android (FCM)
Alertas de SOS e de comunidade com o app fechado.

## P2 — Release assinado + AAB
Keystore, `assembleRelease`/`bundleRelease`, versionCode 4.

## P3 — Play Store e compliance
Ficha da loja, política de privacidade publicada, justificativa de localização em
segundo plano, testes internos.
