# Android — piloto 1.4.0 (13)

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

O serviço Android captura os sensores, mas o motor de detecção e o countdown
ainda executam no JavaScript da WebView. A execução contínua com a WebView
suspensa **não está garantida por esta arquitetura**. A notificação diz
“Viagem ativa”, sem afirmar proteção ou entrega de alertas. A página local e
a compilação do APK não substituem esse aceite físico.
