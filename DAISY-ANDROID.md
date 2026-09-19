# DAISY — voz no Android

## Por que o plugin nativo existe

O APK roda o frontend dentro de uma WebView. A API web `SpeechRecognition`
não é garantida nesse ambiente, portanto a DAISY usa o `SpeechRecognizer` do
Android pelo plugin Capacitor `DaisySpeech`. No navegador compatível, o
fallback web continua disponível.

## Microfone e privacidade

- Permissão: `android.permission.RECORD_AUDIO`.
- Momento do pedido: somente depois de um toque explícito no botão da DAISY.
- Uso: uma escuta curta para transformar fala em texto.
- Sem escuta contínua, em segundo plano ou durante o início do aplicativo.
- Sem gravação ou arquivo de áudio criado pelo Moto Anjo.
- Se a permissão for recusada, mapa, viagem, alertas e SOS continuam ativos.

O serviço de reconhecimento instalado no aparelho pode processar a fala
localmente ou pela rede, conforme a configuração do Android. A declaração de
segurança de dados e a política de privacidade da Play devem informar o uso do
microfone e do reconhecimento de voz antes da publicação desta versão.

## Teste físico obrigatório

1. Instale o novo APK; a atualização apenas do site não adiciona o plugin
   nativo a um APK antigo.
2. Abra a Home e toque no microfone ao lado de `DAISY AI`.
3. Autorize o microfone quando o Android perguntar.
4. Confirme que aparece `Ouvindo…`.
5. Diga `Daisy, qual meu próximo destino?`.
6. Confirme que aparece `Ouvi: ...` e que a resposta por voz é executada.
7. Teste `Daisy, iniciar viagem segura` com e sem destino definido.
8. Negue a permissão e confirme que o app mostra uma mensagem, sem fechar.
9. Desligue a internet e confirme a mensagem de indisponibilidade do serviço
   quando o aparelho não possuir reconhecimento offline.

O comando de ajuda continua exigindo confirmação física no botão SOS. A voz
não aciona sozinha uma ação crítica.
