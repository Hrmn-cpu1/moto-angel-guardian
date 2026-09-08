# Android — piloto 1.5.0 (14)

O APK carrega a URL publicada configurada por `MOTOANJO_WEB_URL`; o frontend
testado localmente só aparece no aparelho depois de publicado nessa URL.
`public/offline.html` é incluído no APK como página de falha de conexão. Seus
botões abrem o discador; não enviam SOS, localização ou mensagens a contatos.
Os números brasileiros seguem a [tabela da Anatel](https://www.gov.br/anatel/pt-br/regulado/numeracao/codigos-nacionais/servicos-de-utilidade-publica-e-de-emergencia).

## Gerar e conferir

Requer Node 22+, JDK 21, Android SDK platform 36 e build tools 36. AGP 8.9.1
atende ao mínimo para API 36 na [matriz oficial Android](https://developer.android.com/build/releases/about-agp), com Gradle 8.11.1. A saída web
atual é `.output/public`. Na raiz:

```sh
npm run build
npx cap sync android
```

Na pasta `android`, com `JAVA_HOME` apontando para JDK 21 e `ANDROID_HOME`
apontando para o SDK:

```sh
./gradlew :app:processDebugMainManifest :app:testDebugUnitTest assembleDebug
```

Saída: `android/app/build/outputs/apk/debug/app-debug.apk`. A assinatura debug
serve para o piloto; não equivale à chave de distribuição do produto.

Para release assinado, o responsável fornece `MOTOANJO_KEYSTORE_FILE`,
`MOTOANJO_KEYSTORE_PASSWORD`, `MOTOANJO_KEY_ALIAS` e `MOTOANJO_KEY_PASSWORD`
no ambiente e executa `./gradlew bundleRelease`. As quatro variáveis são
obrigatórias em conjunto; não há chave privada no repositório. Sem essas
variáveis, a tarefa release produz saída **sem assinatura**.

## Aceite pendente no aparelho

- Instalação, login e retorno ao aplicativo; viagem ao navegar entre telas.
- Primeira abertura sem rede mostra a página local e o retry volta à URL
  configurada. Conferir abertura do discador sem concluir uma ligação.
- Um gesto cancelado no SOS da tela bloqueada não emite pedido. Um gesto
  completo mostra pedido pendente; conferir o registro real no aplicativo.
- Tela bloqueada e economia de bateria: medir continuidade do processamento
  da detecção e do countdown, além da captura de sensores e GPS.
- Finalizar a viagem encerra serviço, sensores e navegação de bloqueio.

O serviço Android agora executa o motor de detecção, countdown e registro HTTP
independentemente da WebView. A credencial tem escopo restrito a abrir SOS na
viagem por até 12 horas e fica criptografada pelo Android Keystore. A API usa
o mesmo registro e a mesma fila do SOS web. Reabrir a WebView preserva a
viagem e o pedido pendente até reconciliar o estado do servidor.

`WAKE_LOCK` mantém o processamento durante a viagem, com prazo renovado
somente enquanto o serviço está ativo; parar a viagem libera o recurso.
O GPS mantém intervalo conservador com distância mínima zero para também
confirmar imobilidade com fixes novos. Impactos entre emissões preservam o
pico. GPS ausente, impreciso ou antigo não confirma uma queda. Essas mudanças
precisam de medição de bateria e continuidade no aparelho real.

O diagnóstico disponível no APK debug mostra um countdown de 15 segundos e
permite cancelar/confirmar **sem criar pedido nem usar a rede**. Ele verifica
o caminho local; não prova entrega de mensagem.

O usuário confirmou em 08/09/2026 que ainda não existe conta oficial Meta para
o produto. O envio automático permanece desligado. Registrar um SOS não
significa avisar contatos: o compartilhamento manual precisa ser concluído
no WhatsApp. A ativação futura exige remetente, template aprovado, webhook
e teste de entrega autorizado antes de ligar o agendador.

O Galaxy A17 observado usa APK 10, assinado com certificado diferente do debug
local. Não desinstalar para atualizar sem preservar os dados e combinar a
reentrada na conta. O aparelho deixou de aparecer no USB antes da instalação
e do teste físico; build e testes automatizados não substituem esse aceite.
