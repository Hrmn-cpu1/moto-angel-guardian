## Adicionar ferramenta MCP `remove_contact`

### 1. Novo arquivo `src/lib/mcp/tools/remove_contact.ts`
- `defineTool` com `name: "remove_contact"`, `title: "Remove emergency contact"`.
- `inputSchema`: `id` (uuid) do contato.
- `annotations`: `destructiveHint: true`, `idempotentHint: true`.
- Handler:
  - Verifica `ctx.isAuthenticated()`.
  - Cria client Supabase com bearer do usuário (RLS aplica).
  - `DELETE FROM emergency_contacts WHERE id = :id AND user_id = ctx.getUserId()` com `.select().maybeSingle()`.
  - Retorna `{ removed: true, contact }` quando apagou, `{ removed: false, id }` quando id não pertence ao usuário / já removido.

### 2. Registrar em `src/lib/mcp/index.ts`
Adicionar import e incluir no array `tools`.

### 3. Atualização automática da lista no app
O hook `useContacts` já relê a tabela a cada montagem/refetch. Para refletir mudanças feitas via MCP em tempo real, ativar **Realtime** na tabela `emergency_contacts` (migração `ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_contacts`) e assinar `postgres_changes` (`event: '*'`) no `useContacts` — ao receber DELETE/INSERT/UPDATE do próprio `user_id`, dispara refetch. Cleanup do canal no unmount.

### 4. Validar manifest
Rodar `app_mcp_server--extract_mcp_manifest` para regenerar `.lovable/mcp/manifest.json` com a nova ferramenta.
