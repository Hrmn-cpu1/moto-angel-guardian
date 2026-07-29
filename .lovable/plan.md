# Agent integrations (MCP) — Moto Anjo

Você escolheu **OAuth**. Isso significa que clientes como ChatGPT/Claude/Codex vão se conectar como um usuário real do Moto Anjo e chamar ferramentas em nome dele. Para isso funcionar de verdade, precisamos de contas de usuário reais no servidor — não dá para expor OAuth sobre o login local (`localStorage`) que o app usa hoje. Por isso o plano tem duas partes.

## Pré-requisito: backend real de contas

Hoje login, cadastro, contatos, viagens, SOS e histórico vivem só no `localStorage` do navegador. Sem contas reais no servidor:
- Não existe usuário para o token OAuth representar.
- Cada dispositivo é uma "conta" isolada, então o cliente MCP não teria como ler o histórico ou os contatos do usuário.
- Não há como o servidor MCP validar o token do usuário.

Então antes do MCP:
1. Ativar **Lovable Cloud** (Supabase gerenciado).
2. Ativar **Cloud Auth** com Email/Senha + Google (padrões da plataforma).
3. Migrar `useAuth` para `supabase.auth` (mantendo a UI atual de login/cadastro/perfil — só troca a fonte).
4. Criar tabelas com RLS por `auth.uid()` para: `profiles`, `emergency_contacts`, `trips`, `sos_events`. Migrar os hooks `useContacts` e `useHistory` para ler/gravar via Supabase (a UI e o design não mudam).
5. A conta demo `demo@motoanjo.com / 123456` continua funcionando (criada via seed).
6. Termos de Uso passam a persistir em `profiles.terms_accepted_at` / `terms_version` (atende o requisito 8 do pedido anterior).

## Parte MCP (OAuth 2.1)

7. Ativar o servidor OAuth do Supabase via `supabase--configure_oauth_server` (habilita authorize/token/DCR para que ChatGPT & cia se registrem sozinhos).
8. Instalar `@lovable.dev/mcp-js` + `zod`, ajustar `bunfig.toml` para permitir a versão recente do pacote `@lovable.dev/mcp-js`.
9. Criar a tela de consentimento em `src/routes/[.]lovable.oauth.consent.tsx` no visual preto/dourado do app, com botões Aprovar/Negar e preservação de `authorization_id` através de login/cadastro (Google e email/senha).
10. Adicionar `mcpPlugin()` em `vite.config.ts` (monta `/mcp` automaticamente).
11. Criar a definição MCP em `src/lib/mcp/index.ts` com `auth.oauth.issuer` apontando para o issuer direto `https://<project-ref>.supabase.co/auth/v1`.
12. Criar as ferramentas em `src/lib/mcp/tools/`, cada uma validando o token com `ctx.isAuthenticated()` / `ctx.getUserId()` e chamando o Supabase com o token do usuário para respeitar RLS:

    | Ferramenta | O que faz |
    |---|---|
    | `get_profile` | Perfil e status do usuário logado |
    | `list_emergency_contacts` | Lista contatos de confiança |
    | `add_emergency_contact` | Cria contato (nome, telefone, relação) |
    | `remove_emergency_contact` | Remove contato pelo id |
    | `list_trips` | Últimas viagens |
    | `list_sos_events` | Últimos acionamentos SOS |
    | `get_last_known_location` | Última localização registrada |
    | `trigger_sos_alert` | Cria um evento SOS (marcado `destructiveHint: false`, `readOnlyHint: false`; retorna id e timestamp) |

13. Adicionar um favicon dourado simples (ícone do connector na lista da Lovable) se ainda não existir um.
14. Rodar `app_mcp_server--extract_mcp_manifest` para gerar `.lovable/mcp/manifest.json` que a UI de Agent integrations lê.

## Design técnico

- **Sem quebrar UI**: nenhuma tela, rota, cor, componente ou fluxo visual muda. Só o backend por trás dos hooks (`useAuth`, `useContacts`, `useHistory`) e a persistência dos termos.
- **Issuer OAuth**: `https://${VITE_SUPABASE_PROJECT_ID}.supabase.co/auth/v1` (não a URL proxy `.lovable.cloud`), lido em build-time.
- **Handlers MCP**: cada handler cria um cliente Supabase com `Authorization: Bearer ${ctx.getToken()}` para que RLS aja como o usuário — nunca service role.
- **Rota de consentimento**: `ssr: false`, `errorComponent`, redireciona não-autenticados para `/login?next=...` preservando `authorization_id`. `/login` e `/register` precisam consumir `next` após sucesso.
- **PWA e ícone**: mantidos.

## Fora do escopo deste plano

- APK Android (fica no PWA como está).
- Chat em tempo real e mapa real.
- Não haverá ferramentas MCP para editar viagens/histórico existentes nesta primeira versão — só leitura, criar contato/SOS e remover contato.

## O que você vai ver depois de aplicar

- Botões "Entrar com Google" e email/senha funcionando de verdade (contas persistem entre dispositivos).
- Painel More → Agent integrations mostrando "Moto Anjo MCP" com o ícone dourado e a lista de ferramentas.
- URL do servidor MCP: `https://moto-angel-guardian.lovable.app/mcp` — colável em ChatGPT/Claude/Codex; o cliente abre a tela de consentimento do Moto Anjo, o usuário aprova, e as ferramentas passam a agir como ele.

Se quiser mudar algo (por exemplo, tirar `trigger_sos_alert` do MCP, ou pular a migração dos dados para Cloud e só migrar auth) me diga antes de aprovar. Caso contrário, aprove para eu executar.
