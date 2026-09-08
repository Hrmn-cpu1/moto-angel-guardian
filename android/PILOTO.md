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

## Aceite físico observado em 08/09/2026

No Galaxy A17 com Android 16, o APK 14 substituiu a instalação anterior após
autorização do usuário. O backup relevante foi restaurado, preservando o
login. Foram concedidas localização precisa e notificações.

A jornada observada incluiu cadastro de um contato de teste consentido,
destino por endereço, cálculo da rota, início da viagem e registro de SOS
manual com GPS recente. O app abriu o WhatsApp apenas para o destinatário
autorizado. A mensagem foi prefixada com “TESTE AUTORIZADO” e identificada
como não sendo uma emergência real; o WhatsApp exibiu “Entregue”. Essa é
prova de envio manual concluído e entrega observada nesse teste.

O diagnóstico local de 15 segundos foi visto durante a contagem, em
12 segundos, e expirou sem criar SOS. O bloqueio de tela foi exercitado
brevemente, sem medição rigorosa da duração com tela apagada.

O cancelamento do SOS exibiu confirmação e removeu o marcador do mapa.
Finalizar a viagem exibiu confirmação; a inspeção ADB posterior não encontrou
`ViagemSeguraService` em execução. O histórico mostrou viagem concluída de
4 min 34 s e SOS às 16:03, preservando os registros anteriores. A distância
permaneceu “não medida” no teste parado. Esses resultados permitem continuar
o piloto, sem declarar toda a proteção automática validada.

### Reabertura posterior e correção publicada

Depois dessa jornada, reabrir o app com processo novo mostrou novamente a tela
de permissão, embora o Android já tivesse autorizado o GPS. O log registrou
`Geolocation.then() is not implemented on android`. A correção `ab282f6` usa
wrapper simples do proxy e fallback com tempo limitado. Passaram 9 testes
comportamentais de permissão, 2 de GPS, 7 testes unitários de permissão, lint,
typecheck, build e revisão independente. A publicação da revisão web
`2026-09-08-gps-permission-proxy-fix` foi confirmada em `release.json`.

O Android desconectou do USB antes da última reabertura física. Esse aceite
continua pendente de reconexão; não invalida as provas anteriores de login
restaurado, rota, SOS manual e encerramento, nem confirma a correção no aparelho.

## Aceites ainda pendentes

- Reabertura física após a correção de permissão publicada; depois, conferir
  continuidade da viagem ao navegar entre telas e após recriação do processo.
- Primeira abertura sem rede mostra a página local e o retry volta à URL
  configurada. Conferir abertura do discador sem concluir uma ligação.
- Um gesto cancelado no SOS da tela bloqueada não emite pedido. Um gesto
  completo mostra pedido pendente; conferir o registro real no aplicativo.
- **NOT PROVEN:** períodos longos com tela apagada, economia de bateria e
  perda/retorno de rede. Medir detecção, countdown, sensores e GPS nessas
  condições; o diagnóstico local breve não comprova continuidade prolongada.
- Conferir interrupção das emissões de sensores e da navegação de bloqueio
  após finalizar; a ausência do serviço foi observada no teste acima.
- **NOT PROVEN:** calibração do motor e detecção confiável de acidentes reais.
  Os testadores devem permanecer parados e não simular quedas.

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

**NOT PROVEN: envio automático.** O usuário confirmou em 08/09/2026 que ainda
não existe conta oficial Meta para o produto. O envio automático permanece
desligado. Registrar um SOS não
significa avisar contatos: o compartilhamento manual precisa ser concluído
no WhatsApp. A ativação futura exige remetente, template aprovado, webhook
e teste de entrega autorizado antes de ligar o agendador.

## Distribuição do piloto

Publicação verificada em 08/09/2026:
[página para testadores](https://moto-angel-guardian.lovable.app/testar.html)
com HTTP 200 e conteúdo idêntico a `public/testar.html`. O navegador mostrou
o botão de download e o roteiro de instalação sem problemas visuais.

O [APK 14 para download](https://moto-angel-guardian.lovable.app/downloads/moto-anjo-1.5.0-piloto.apk)
foi baixado integralmente (9,3 MB). SHA-256 confirmado, igual ao APK instalado
no aparelho do teste:
`4f5034baad236e1d2b855929ea5ed5de95df145aed21b6a3a7e2eadffaf733c1`.

O roteiro inclui login Google/e-mail, permissões, contato consentido e
conclusão manual do aviso no WhatsApp; não representa validação do envio
automático.

Instalações antigas podem ter certificado diferente do APK debug distribuído.
Não desinstalar para atualizar sem preservar os dados relevantes e confirmar
como entrar novamente na conta. A substituição autorizada com restauração de
backup funcionou no aparelho deste teste; isso não garante migração automática
em todos os dispositivos.
