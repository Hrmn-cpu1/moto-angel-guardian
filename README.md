# Guardian Rider

Crie um aplicativo chamado MOTO ANJO, com foco em segurança para motociclistas, comunidade, localização e acionamento de emergência.



IMPORTANTE:

Não criar um visual genérico de aplicativo.

O design precisa ter aparência premium, forte, elegante e tecnológica.



IDENTIDADE VISUAL



Paleta principal:

- Preto profundo: #050505

- Preto secundário: #111111

- Dourado metálico: #D4AF37

- Dourado claro: #F3D675

- Vermelho de emergência: #D92323

- Branco: #F5F5F5

- Cinza: #8C8C8C



Estilo:

- Fundo predominantemente preto.

- Bordas finas douradas.

- Botões com degradê dourado discreto.

- Vermelho usado apenas em emergência, SOS e alertas críticos.

- Tipografia forte e sofisticada.

- Sombras suaves.

- Cartões com aparência de vidro escuro.

- Interface moderna, premium e confiável.

- Nada infantil, colorido demais ou genérico.

- Evitar azul padrão de aplicativos.

- Criar animações elegantes e discretas.



TECNOLOGIA



Criar em:

- React

- TypeScript

- Vite

- Tailwind CSS

- Componentização limpa

- Layout responsivo mobile-first

- Preparado para empacotamento Android com Capacitor



Instalar e configurar:

- @capacitor/core

- @capacitor/cli

- @capacitor/android

- @capacitor/geolocation

- @capacitor/share

- @capacitor/preferences

- lucide-react



Criar capacitor.config.ts com:

- appId: com.motoanjo.app

- appName: Moto Anjo

- webDir: dist



OBJETIVO DESTA PRIMEIRA VERSÃO



Criar um MVP funcional e demonstrável, com navegação real entre telas e armazenamento local.



TELAS



1. SPLASH SCREEN



- Fundo preto.

- Logo central Moto Anjo em dourado.

- Nome MOTO ANJO.

- Frase: “Proteção em cada caminho.”

- Animação suave de entrada.

- Após alguns segundos, abrir a tela de boas-vindas.



2. TELA DE BOAS-VINDAS



- Imagem de destaque de um motociclista em estrada escura.

- Sobreposição escura.

- Logo dourado.

- Título:

  “Sua jornada mais segura começa aqui.”

- Texto:

  “Proteção, localização e comunidade para quem vive sobre duas rodas.”

- Botão dourado: ENTRAR

- Botão contornado: CRIAR CONTA



3. LOGIN



Campos:

- E-mail

- Senha



Ações:

- Entrar

- Esqueci minha senha

- Criar conta



Criar validação visual.

Para o MVP, permitir login local.

Salvar sessão com Capacitor Preferences ou localStorage.



Credenciais de demonstração:

- E-mail: demo@motoanjo.com

- Senha: 123456



4. CADASTRO



Campos:

- Nome completo

- E-mail

- Telefone

- Senha

- Confirmar senha

- Modelo da motocicleta

- Placa

- Tipo sanguíneo

- Contato de emergência

- Telefone de emergência



Checkbox:

- Aceito os termos de uso e política de privacidade



Botão:

- CRIAR CONTA



Salvar os dados localmente.



5. TELA INICIAL / DASHBOARD



Criar cabeçalho:

- Saudação: “Bom dia, motociclista.”

- Nome do usuário

- Foto/avatar

- Ícone de notificações



Criar um grande cartão principal:

- Título: ESCUDO MOTO ANJO

- Status: PROTEÇÃO ATIVA

- Indicador verde discreto

- Texto:

  “Localização e recursos de segurança disponíveis.”

- Ícone de escudo dourado

- Botão: VER STATUS



Criar seção:

“Seu caminho hoje”



Mostrar:

- Localização atual

- Status do GPS

- Clima fictício para demonstração

- Última sincronização



Criar atalhos em grade:



- Iniciar viagem

- Compartilhar localização

- Rotas seguras

- Comunidade

- Meus contatos

- Histórico



Criar botão SOS flutuante vermelho, sempre visível no dashboard.



Barra inferior:

- Início

- Mapa

- Comunidade

- Perfil



6. TELA SOS



Esta tela deve ser visualmente forte e clara.



- Fundo preto.

- Grande círculo vermelho pulsando.

- Texto:

  “EMERGÊNCIA”

- Subtexto:

  “Pressione e segure por 3 segundos para ativar o alerta.”

- Criar botão SOS com interação de pressionar e segurar.

- Mostrar contagem regressiva:

  3, 2, 1.

- Após ativação, mostrar:

  “Alerta de demonstração ativado.”

- Capturar localização usando Capacitor Geolocation quando disponível.

- Caso não esteja disponível, usar uma localização simulada.

- Mostrar latitude e longitude.

- Criar botão:

  “Compartilhar alerta”

- Usar Capacitor Share quando disponível.

- Criar botão:

  “Cancelar alerta”



Não ligar automaticamente para polícia, bombeiros ou ambulância.

Deixar claro que é uma demonstração.



7. MAPA



Criar uma tela visual de mapa.



Para o MVP:

- Usar uma representação visual estilizada caso não haja chave de API.

- Mostrar posição atual.

- Mostrar pontos fictícios:

  - Hospital

  - Posto de combustível

  - Oficina

  - Ponto de apoio Moto Anjo

- Botão:

  “Centralizar localização”

- Botão:

  “Compartilhar localização”

- Botão:

  “Iniciar rota”



Se possível, usar OpenStreetMap com Leaflet.

Se usar Leaflet, instalar:

- leaflet

- react-leaflet



Não depender de chave paga.



8. INICIAR VIAGEM



Criar fluxo:

- Tela de preparação

- Confirmar GPS ativo

- Confirmar bateria

- Escolher contato para acompanhar

- Botão: INICIAR VIAGEM



Durante a viagem, mostrar:

- Tempo de viagem

- Distância simulada

- Velocidade atual simulada

- Botão de pausa

- Botão de encerrar

- Botão SOS



Ao encerrar:

- Mostrar resumo da viagem

- Salvar no histórico local



9. COMUNIDADE



Criar feed simples com dados de demonstração.



Cada publicação deve mostrar:

- Nome

- Avatar

- Horário

- Texto

- Curtidas

- Comentários



Criar botão:

- Nova publicação



Criar categorias:

- Alertas na estrada

- Dicas

- Eventos

- Oficinas

- Geral



10. CONTATOS DE CONFIANÇA



Mostrar lista de contatos.



Permitir:

- Adicionar contato

- Editar

- Remover

- Definir contato principal

- Compartilhar localização



Salvar localmente.



11. HISTÓRICO



Mostrar:

- Viagens recentes

- Alertas SOS de demonstração

- Compartilhamentos de localização



Cada item com data e horário.



12. PERFIL



Mostrar:

- Foto

- Nome

- E-mail

- Telefone

- Moto

- Placa

- Tipo sanguíneo

- Contato de emergência



Permitir edição.



Criar opções:

- Dados pessoais

- Minha motocicleta

- Contatos de confiança

- Privacidade

- Permissões

- Sobre o Moto Anjo

- Sair



13. NOTIFICAÇÕES



Criar tela com notificações fictícias:

- Contato começou a acompanhar sua viagem

- Alerta de trecho perigoso

- Viagem encerrada com segurança

- Localização compartilhada



FUNCIONALIDADES OBRIGATÓRIAS



- Navegação funcional entre todas as telas.

- Login e cadastro local.

- Persistência de usuário.

- Persistência da sessão.

- Persistência de contatos.

- Persistência do histórico.

- Captura de localização.

- Compartilhamento.

- Botão SOS com pressionar e segurar.

- Layout responsivo para Android.

- Tratar falhas de permissão.

- Não quebrar caso o GPS seja negado.

- Criar feedback de carregamento.

- Criar mensagens de sucesso e erro.

- Criar estado vazio nas listas.

- Não usar links quebrados.

- Não deixar botões sem ação.



ESTRUTURA DO PROJETO



Organizar em:



src/

  components/

  pages/

  hooks/

  services/

  store/

  types/

  assets/

  utils/



Criar componentes reutilizáveis:

- GoldButton

- OutlineButton

- EmergencyButton

- PremiumCard

- BottomNavigation

- Header

- LoadingScreen

- EmptyState

- StatusBadge

- LocationCard



QUALIDADE



- Não usar código todo em um único arquivo.

- Não deixar erros TypeScript.

- Não deixar imports inválidos.

- Não usar componentes inexistentes.

- Não depender de serviços pagos.

- Não criar backend obrigatório nesta primeira versão.

- Não criar Firebase agora.

- O aplicativo precisa funcionar localmente primeiro.

- Gerar build sem erros com npm run build.

- Criar README com instruções de execução e build Android.



CAPACITOR



Ao final:

- Garantir que npm run build funcione.

- Configurar Capacitor.

- Preparar os comandos:



npm install

npm run build

npx cap add android

npx cap sync android

npx cap open android



Criar permissões Android necessárias para:

- Internet

- Localização aproximada

- Localização precisa



Não adicionar permissões desnecessárias.



RESULTADO ESPERADO



Quero uma primeira versão funcional do Moto Anjo, com aparência premium e pronta para ser empacotada em APK Android.



Priorizar:

1. Funcionamento

2. Navegação

3. Visual premium

4. SOS de demonstração

5. GPS

6. Build Android



Não gastar tempo com backend avançado nesta etapa.



Comece criando o projeto completo agora.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://moto-angel-guardian.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/532c42c1-6f30-4d66-a5ad-6bf7cc4eaade).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
