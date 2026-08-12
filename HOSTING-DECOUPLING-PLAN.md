# PLANO DE DESACOPLAMENTO DO LOVABLE

Nada aqui foi executado. É um plano, e a decisão é sua.

## O que existe hoje

O APK é uma **casca**: `capacitor.config.ts` aponta `server.url` para
`https://moto-angel-guardian.lovable.app`. O aplicativo instalado não contém a
interface — ele abre um navegador embutido nesse endereço.

Consequências, sem rodeio:

| Situação | O que acontece |
|---|---|
| Sem internet | o app não abre. Nem a tela inicial. **Nem o SOS.** |
| Lovable fora do ar | idem, em todos os aparelhos ao mesmo tempo |
| Créditos do Lovable acabam | se o projeto for suspenso, o app para |
| Publicar correção | instantâneo, sem passar pela Play |
| APK de uma versão | não congela nada: o APK antigo carrega o site novo |

O ponto que mais pesa: **num app de segurança, o SOS depender de um domínio de
terceiro estar no ar é a maior fragilidade do produto** — maior que qualquer
bug desta lista.

## De quem o projeto depende hoje

| Peça | Onde vive | Se sair do ar |
|---|---|---|
| Interface e SSR | Lovable | app inteiro morre |
| Server functions (`triggerSos`, `dispatchSos`, POIs, troca PKCE) | Lovable | SOS e login nativo param |
| Login Google | broker `${origin}/~oauth/initiate` | login Google morre |
| Chave do Maps (fallback) | `VITE_LOVABLE_CONNECTOR_...`, restrita a `*.lovable.app` | mapa morre em domínio próprio |
| POIs | `connector-gateway.lovable.dev` | camada de apoio morre |
| Banco | Supabase | depende de quem é o dono do projeto |

Separe duas coisas que costumam ser confundidas: **o Lovable como editor** e
**o Lovable como runtime**. Parar de usar o editor é fácil. Sair do runtime é
o trabalho descrito abaixo.

## Caminho, em três etapas independentes

### Etapa 1 — tirar o build do Android do caminho do Lovable (baixo risco)

O `android.yml` já faz isso: o APK sai do GitHub Actions, a partir do
repositório. **Nenhuma credencial do Lovable é necessária para compilar.** É a
etapa que já está feita nesta entrega.

### Etapa 2 — hospedar a interface em outro lugar (risco médio)

O projeto é TanStack Start; roda em Netlify, Vercel, Fly ou Cloudflare.

1. domínio próprio (ex.: `app.motoanjo.com.br`);
2. deploy do mesmo repositório na hospedagem escolhida;
3. **chave própria do Google Maps**, restrita ao domínio novo — hoje o
   fallback só funciona em `*.lovable.app`;
4. variáveis de ambiente no CI da hospedagem;
5. Places chamado direto na Google, sem o gateway;
6. login Google direto no Supabase Auth, sem o broker — **este é o passo mais
   delicado**, porque mexe em Auth, que está validado e funcionando;
7. trocar `server.url` para o domínio novo e gerar APK.

Estimativa honesta: dias de trabalho, sendo a maior parte configuração e
teste, não código. O item 6 exige um checkpoint próprio.

### Etapa 3 — parar de ser casca (risco alto, decisão de produto)

Embarcar a interface no APK (`server.url` some, o Capacitor serve os arquivos
locais) e falar direto com o Supabase.

Ganha: o app abre sem internet, mostra a última posição conhecida, e o SOS
pode enfileirar e enviar quando a rede voltar.

Custa: as server functions do TanStack precisam virar Edge Functions do
Supabase (ou serviço próprio); atualização passa a exigir publicar na Play; e
o `triggerSos` — que hoje revalida no servidor o que o cliente manda — precisa
ser repensado para não confiar no cliente.

**Recomendação:** faça a Etapa 2 antes de ter usuários reais. A Etapa 3 só
faz sentido quando o produto tiver tração, e merece um checkpoint inteiro.

## Enquanto nada disso acontece

Diga a verdade na loja e para os motoboys: **o Moto Anjo precisa de internet
para funcionar.** Um app de segurança que promete proteção e não abre sem
sinal é pior do que um que avisa.
