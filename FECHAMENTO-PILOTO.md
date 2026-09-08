# Moto Anjo — fechamento do piloto Android

Versão 1.4.0-piloto (13), 08/09/2026. O código está pronto para o piloto;
a operação real de SOS e a distribuição pela Play Store ainda dependem dos
aceites abaixo.

## Jornada entregue

- Entrar: troca nativa de código atômica e validação do par de tokens.
- Preparar: contato real, GPS, serviço e compartilhamento visíveis no cockpit.
- Viajar: proteção, SOS e compartilhamento pertencem à sessão autenticada e
  continuam ao navegar entre páginas. Fora do mapa, o Android descarta
  instruções e ETA que deixaram de ser atualizados.
- Acionar SOS: fila durável, consumidor autenticado, template configurável e
  webhook assinado. Resultado desconhecido não vira entrega nem retry cego.
- Compartilhar: interface só confirma ativação/interrupção após resposta do
  servidor; consulta que falha continua com estado desconhecido.
- Encerrar: duração salva em fila local por usuário, sincronização idempotente
  inclusive com finalizações concorrentes e indicação de distância não medida.
- Android: cancelar gesto não dispara SOS; abertura sem rede tem página local
  com discador e tentativa de reconexão.

## Evidências verificadas

- 593 testes existentes e 25 testes novos de comportamento passaram.
- Typecheck, build web, lint dos arquivos alterados (0 erros, 4 avisos históricos)
  e `git diff --check` passaram.
- PostgreSQL isolado: migrations, isolamento do histórico, 20 claims concorrentes
  sem duplicação, 20 disputas recibo/settlement e 10 consumos simultâneos de um
  código nativo (um vencedor) passaram.
- Lovable Cloud: migrations `20260908000100` e `20260908000200` aplicadas via SQL
  editor. Instalado `moto-anjo-sos-dispatch`, inicialmente desativado.
- `npx cap sync android`, `testDebugUnitTest` e `assembleDebug`: BUILD SUCCESSFUL.
  APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
  SHA-256: `b165e56e0f38190fe8753d32f4c4581e8e6394e742688f0ef1f25738a02908ca`.
- Publicação verificada em
  [release.json](https://moto-angel-guardian.lovable.app/release.json):
  `1.4.0-piloto`, build 13, código `93fdc6276ca7c440e23234ef4714862e70cf503e`.
  Jornada pública até login verificada no navegador, sem erros de console.
- Banco de produção confirmou histórico e dispatcher instalados, job desativado
  e ausência de permissão do cliente para executar o dispatcher. Sem os segredos,
  os endpoints de dispatch e webhook respondem 503; nenhum SOS real foi enviado.
- Progresso registrado no
  [Saraiva OS](https://airtable.com/appGIS6XGbfscwWdd/tblleZDTyqFjS8qZx/recavYltApeKOEm6C).
- [CI Android](https://github.com/Hrmn-cpu1/moto-angel-guardian/actions/runs/34258715567)
  concluído com sucesso; artefato `moto-anjo-android-debug` publicado. A assinatura
  debug e o hash desse APK do CI podem diferir do APK local identificado acima.

## Aceites que ainda fecham a operação

1. Configurar credenciais Meta, template aprovado e assinatura do webhook;
   testar recebimento com dois participantes que consentiram. Só depois ativar
   `SOS_DELIVERY_ENABLED` e o job conforme `supabase/operations/schedule-sos.sql`.
2. Instalar este APK em dois Androids e provar login, tela bloqueada, economia
   de bateria, perda/retorno de rede, cancelamento, entrega e encerramento.
   O motor de detecção ainda depende de JavaScript na WebView: continuidade
   com ela suspensa não está comprovada.
3. Para Play Store: chave de distribuição, AAB assinado, conta de publicação,
   ficha e declarações da loja. Este APK usa assinatura debug de piloto.

Roteiro e comandos Android: [android/PILOTO.md](android/PILOTO.md).
Configuração do backend: [.env.example](.env.example).
