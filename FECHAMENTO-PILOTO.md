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

## Evidência desta versão

- Revisões independentes de Java, backend e frontend concluídas sem novos
  bloqueantes no código revisado. Testes unitários e comportamentais,
  typecheck, build web e lint dos arquivos alterados passaram.
- 26 testes Java; `testDebugUnitTest` e `assembleDebug`: BUILD SUCCESSFUL.
- PostgreSQL isolado confirmou autorização, revogação, validade, isolamento,
  idempotência, cancelamento durante registro e 20 disputas entre dispositivos
  sem deadlock. Nenhuma mensagem externa foi usada nesses testes.
- Lovable Cloud: migration `20260908000300_native_protection.sql` aplicada,
  além das migrations 001 e 002. Quatro funções nativas com execução exclusiva
  do servidor; tabela com RLS. Agendador de envio continua desativado.
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
  entrega observada nesse teste, sem validar o envio automático da Meta.
- Cancelamento do SOS: confirmação na interface e remoção do marcador no
  mapa. Finalização da viagem: confirmação na interface e ausência de
  `ViagemSeguraService` na inspeção ADB posterior.
- Histórico: “Viagem concluída” com duração de 4 min 34 s e registro do SOS
  às 16:03. O histórico anterior foi preservado; a distância aparece como
  “não medida”, sem inventar deslocamento no teste parado.

Distribuição preparada em `public/testar.html` e
`public/downloads/moto-anjo-1.5.0-piloto.apk`. A publicação e o download pela
URL pública ainda precisam ser confirmados; a existência dos arquivos no
repositório não é prova de disponibilidade para testadores.

## Aceites externos pendentes

1. **NOT PROVEN:** envio automático. O usuário confirmou que ainda não
   existe conta oficial Meta para o produto.
   O envio automático permanece desligado. Configurar remetente, template e
   webhook; comprovar entrega autorizada antes de ativar o agendador. O
   compartilhamento manual precisa ser concluído no WhatsApp.
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
