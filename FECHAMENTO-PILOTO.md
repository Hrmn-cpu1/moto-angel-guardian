# Moto Anjo — piloto Android 1.5.0 (14)

Atualização de 08/09/2026. O código, o backend e o APK foram preparados para
validação física. Não equivale a uma operação de SOS 100% validada.

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

## Aceites externos pendentes

1. O usuário confirmou que ainda não existe conta oficial Meta para o produto.
   O envio automático permanece desligado. Configurar remetente, template e
   webhook; comprovar entrega autorizada antes de ativar o agendador. O
   compartilhamento manual precisa ser concluído no WhatsApp.
2. O Galaxy A17/Android 16 apareceu com APK 10, mas desconectou antes do QA.
   Não foi instalado o APK 14 nem enviado SOS real. Reconectar e manter o
   aparelho desbloqueado; preservar dados e login ao resolver a diferença de
   assinatura entre o APK instalado e o debug local. Provar tela bloqueada,
   perda/retorno de rede, cancelamento, registro, envio manual e encerramento.
3. Medir bateria e continuidade em diferentes aparelhos. Os testes sintéticos
   do motor não demonstram detecção confiável de acidentes reais.
4. Distribuição Play Store requer chave, AAB assinado e conta/ficha da loja;
   este APK é de piloto e usa assinatura debug.

Roteiro Android: [android/PILOTO.md](android/PILOTO.md).
Configuração backend: [.env.example](.env.example).
