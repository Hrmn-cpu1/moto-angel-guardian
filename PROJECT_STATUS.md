# PROJECT STATUS — MOTO ANJO (2026-08-10)

Classificação por evidência real. Existir código não conta como validado.

## ✅ VALIDADO

- **Build web**: `npm run build` conclui sem erro (Nitro/Worker).
- **Testes**: 105/105 passando (`npm test`).
- **Typecheck**: `tsc --noEmit` limpo.
- **Lint**: configuração ESLint 9 + Prettier ativa.
- **npm ci**: lockfile em sincronia com `package.json`.
- **GitHub Actions**: workflow "Android Debug APK (v3)" execução #3 com SUCESSO e artifact publicado.
- **APK Android compilado**: `app-debug.apk`, `com.motoanjo.app`, versionCode 3 / versionName 1.2.
- **Instalação no Android físico** (Samsung): app instala e abre.
- **Google OAuth no Android (v3)**: login conclui e entra no **Dashboard** — validado fisicamente.
- **Deep link PKCE**: o link `com.motoanjo.app://auth/callback` carrega apenas código opaco; nenhum token na URL.
- **Arquitetura SOS Checkpoint 1B**: migrations aplicadas, `sos_events` somente leitura para o app, zero escrita direta no frontend, idempotência por `request_id`, um SOS ativo por usuário.
- **Publicação web**: https://moto-angel-guardian.lovable.app respondendo.

## ⚠️ FUNCIONAL, MAS AINDA PRECISA DE TESTE FÍSICO

- Login e cadastro por **e-mail/senha** dentro do APK (fluxo de confirmação de e-mail e reenvio).
- Recuperação de senha (`/forgot-password` → `/reset-password`) no aparelho.
- Persistência de sessão após fechar/reabrir o app e após reboot.
- **SOS ponta a ponta no aparelho**: hold 3 s → `sos_open` → fila → mensagem realmente recebida no WhatsApp do contato → cancelar → aparecer no histórico.
- Envio automático pela **WhatsApp Cloud API** (depende de `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` configurados e template aprovado); fallback manual `wa.me` também não validado no aparelho.
- **GPS em movimento**: `watchPosition`, velocímetro e giroscópio (`useRideTelemetry`).
- Permissão de localização em runtime, inclusive negação e "somente aproximada".
- Contatos de emergência (CRUD e contato principal) no aparelho.
- Compartilhamento de localização ao vivo (`live_locations`, `location_shares`, aprovação/revogação).
- Riders online no mapa, alertas próximos, heatmap de risco.
- Comunidade (post, comentário, curtida) pelo APK.
- Painel admin (`/admin`, `has_role`) com dados reais.
- Fluxo de viagem (`/ride`, `/trip`) e gravação em `trips`.
- Notificações in-app, perfil, termos e privacidade no APK.
- Splash nativa e ícones adaptativos em várias densidades.

## ❌ PENDENTE / BUG CONHECIDO

1. **Google Maps — mapa-base preto no Dashboard Android (P0).** Marcador e
   componentes aparecem; os tiles não. Causa provável: referrer do WebView fora
   da allowlist da chave gerenciada (`*.lovable.app`) ou ausência de
   `VITE_GOOGLE_MAPS_BROWSER_KEY` própria. Diagnóstico em
   `HANDOFF_MOTO_ANJO.md` §6.
2. **Sem build de release assinado**: só existe `app-debug.apk`. Não há keystore,
   nem `signingConfigs`, nem AAB para a Play Store.
3. **Sem push notifications**: `google-services.json` ausente; o `app/build.gradle`
   apenas registra no log que o plugin não foi aplicado.
4. **Sem rastreamento em background**: a localização só atualiza com o app em
   primeiro plano — limitação relevante para o caso de uso de emergência.
5. **WhatsApp Cloud API não comprovada em produção**: nenhuma entrega
   (`delivered_at`) confirmada em teste físico.
6. **Dependência de conectividade**: o APK carrega a app remota via `server.url`;
   sem internet a tela fica vazia, sem modo offline nem tela de erro dedicada.
7. **README anterior** continha o prompt original em vez de instruções — corrigido
   neste handoff, mas vale revisão de conteúdo.
8. **Sem testes de UI/E2E**: os 105 testes cobrem lógica pura (SOS, coords,
   telefone, servidor), não componentes nem fluxo de navegação.
