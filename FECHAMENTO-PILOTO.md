# Moto Anjo — piloto Android 1.5.0 (14)

Atualização de 08/09/2026. O APK 14 passou pela jornada física de viagem e
SOS manual com um contato autorizado. Há evidência para continuar o piloto
com testadores; não equivale a uma operação de SOS 100% validada.

## Jornada implementada

- Android executa sensores, detecção, countdown, registro HTTP e recuperação
  do pedido sem depender da WebView. Preserva picos de impacto e exige GPS
  recente para confirmar imobilidade; uma assinatura antiga expira.
- Credencial por viagem com escopo restrito e validade máxima de 12 horas,
  armazenada com Android Keystore. Nenhum token de autenticação no APK.
- O backend usa o mesmo SOS e a mesma fila durável da interface. Pedidos
  repetidos não duplicam eventos, e pedidos encerrados não voltam à fila.
- Reabrir o app preserva o pedido nativo enquanto hidrata a viagem. Falhas de
  sincronização mantêm o painel com contatos e compartilhamento manual.
- Cancelar um pedido sem resposta exige confirmação do servidor. Encerrar a
  viagem não pode apagar um novo SOS na disputa entre sensores e interface.
- Finalizar salva a duração de forma idempotente; sair encerra a viagem e o
  serviço. Perfil confirma gravação antes de fechar o formulário. O botão de
  login WhatsApp sem implementação foi retirado.
- Diagnóstico debug de countdown por 15 segundos não cria SOS nem chama rede.
- Posição no mapa representada por uma motinho, com navegação em perspectiva
  inclinada. O backend aceita provedores WhatsApp Meta ou Evolution, sem
  colocar credenciais do provedor no aplicativo.

## Evidência desta versão

- Revisões independentes de Java, backend e frontend concluídas sem novos
  bloqueantes no código revisado. Testes unitários e comportamentais,
  typecheck, build web e lint dos arquivos alterados passaram.
- Na etapa de mapa e integração Evolution, passaram 599 testes unitários,
  112 comportamentais e o build. Após os ajustes finais, passaram 601 unitários e 142 comportamentais.
- 26 testes Java; `testDebugUnitTest` e `assembleDebug`: BUILD SUCCESSFUL.
- PostgreSQL isolado confirmou autorização, revogação, validade, isolamento,
  idempotência, cancelamento durante registro e 20 disputas entre dispositivos
  sem deadlock. Nenhuma mensagem externa foi usada nesses testes.
- Lovable Cloud: migration `20260908000300_native_protection.sql` aplicada,
  além das migrations 001 e 002. Quatro funções nativas com execução exclusiva
  do servidor; tabela com RLS. Agendador de envio configurado com credencial exclusiva no Vault.
- APK local: `android/app/build/outputs/apk/debug/app-debug.apk`.
  SHA-256: `4f5034baad236e1d2b855929ea5ed5de95df145aed21b6a3a7e2eadffaf733c1`.
- Identificador web desta versão: `1.5.0-piloto`, build 14,
  `2026-09-08-native-sos`, em
  [release.json](https://moto-angel-guardian.lovable.app/release.json).
- Registro operacional:
  [Saraiva OS](https://airtable.com/appGIS6XGbfscwWdd/tblleZDTyqFjS8qZx/recavYltApeKOEm6C).

## Prova física de 08/09/2026

- Galaxy A17 com Android 16: APK 14 instalado por substituição autorizada
  pelo usuário. O backup relevante foi restaurado e o login permaneceu ativo.
- Localização precisa e notificações autorizadas. Mapa com posição real,
  contato de teste consentido cadastrado, destino por endereço com rota
  calculada e viagem iniciada no aplicativo.
- Diagnóstico local de 15 segundos: countdown observado em 12 segundos e
  encerrado sem gerar SOS. O bloqueio de tela foi exercitado brevemente;
  não houve medição rigorosa do tempo de execução com a tela apagada.
- SOS manual registrado com GPS recente. O aplicativo abriu o WhatsApp
  somente para o destinatário autorizado. A mensagem foi identificada como
  “TESTE AUTORIZADO”, com aviso de que não era uma emergência real.
- O WhatsApp mostrou “Entregue” para essa mensagem manual. Isso comprova a
  entrega observada nesse teste, sem validar envio automático por um provedor.
- Cancelamento do SOS: confirmação na interface e remoção do marcador no
  mapa. Finalização da viagem: confirmação na interface e ausência de
  `ViagemSeguraService` na inspeção ADB posterior.
- Histórico: “Viagem concluída” com duração de 4 min 34 s e registro do SOS
  às 16:03. O histórico anterior foi preservado; a distância aparece como
  “não medida”, sem inventar deslocamento no teste parado.
- A motinho e a perspectiva 3D do mapa foram confirmadas no Android pela
  captura local `/tmp/moto-3d-device2.png`.

Após essa jornada, uma reabertura com processo novo voltou à tela de permissão
apesar do GPS já autorizado. O log apontou `Geolocation.then() is not implemented on android`.
A correção `ab282f6` removeu o retorno direto do proxy assíncrono, usando um
wrapper simples e fallback com tempo limitado. Passaram 9 testes comportamentais
de permissão, 2 de GPS, 7 testes unitários de permissão, lint, typecheck e build,
além de revisão independente. A revisão web publicada
`2026-09-08-gps-permission-proxy-fix` foi confirmada em `release.json`.
**Reabertura física confirmada às 16:23:** após reconectar o Galaxy A17, o
processo foi encerrado e iniciado novamente. O app abriu diretamente no mapa,
com indicador GPS verde e login preservado, sem tocar em permitir localização.
A consulta nativa `checkPermissions` foi observada e o processo novo não
registrou o erro `Geolocation.then()` nem erro fatal do Android.

Distribuição pública verificada em 08/09/2026:
[página para testadores](https://moto-angel-guardian.lovable.app/testar.html)
respondeu HTTP 200, com conteúdo idêntico a `public/testar.html`. A página
foi conferida no navegador, com botão de download e instruções visíveis.
O [APK 14](https://moto-angel-guardian.lovable.app/downloads/moto-anjo-1.5.0-piloto.apk)
foi baixado integralmente (9,3 MB); seu SHA-256 corresponde ao APK instalado
no teste físico:
`4f5034baad236e1d2b855929ea5ed5de95df145aed21b6a3a7e2eadffaf733c1`.

## Aceites externos pendentes

1. **Envio validado com destinatário autorizado:** a fila de produção enviou
   pela Evolution e o provedor registrou `DELIVERY_ACK`. O teste seguinte
   confirmou `locationMessage` nativo, coordenadas de teste correspondentes,
   ausência de link Google Maps e `DELIVERY_ACK`. Cada item envia um único
   cartão com nome, horário e telefone; aceite e entrega permanecem distintos
   no painel. A consulta de recibos foi restrita aos IDs dessas mensagens.
   O corte temporal impede disparar alertas anteriores à ativação. O fluxo
   manual continua como alternativa quando oferecido pelo painel.
2. **NOT PROVEN:** continuidade por períodos longos com tela apagada,
   economia de bateria e perda/retorno de rede. O diagnóstico breve e a
   jornada manual não comprovam esses cenários.
3. **NOT PROVEN:** calibração e detecção confiável de acidentes reais.
   Medir bateria e continuidade em diferentes aparelhos; os testes
   sintéticos do motor não substituem validação de campo especializada.
4. Distribuição Play Store requer chave, AAB assinado e conta/ficha da loja;
   este APK é de piloto e usa assinatura debug.

Roteiro Android: [android/PILOTO.md](android/PILOTO.md).
Configuração backend: [.env.example](.env.example).
