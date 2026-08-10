# PROJECT_STATUS — MOTO ANJO

Estado real do repositório em **2026-08-10** (após a correção do mapa).
Só entra em ✅ o que foi comprovado por execução ou por teste físico.

## ✅ VALIDADO

| Item | Evidência |
| --- | --- |
| Build web | `npm run build` exit 0 (Nitro/Worker) |
| Testes | **105/105** (`npm test`) |
| Typecheck | `tsc --noEmit` exit 0 |
| Lint do código alterado | `eslint src/components/RealMap.tsx` — 0 erros |
| GitHub Actions | "Android Debug APK (v3)" execução #3 — SUCCESS, artifact gerado |
| Gradle | `assembleDebug` concluído no runner |
| APK Android v3 | `com.motoanjo.app`, versionCode 3, versionName 1.2 |
| Instalação no Samsung | APK v3 instalado em aparelho físico |
| Google OAuth Android | login concluído fisicamente |
| Retorno via deep link | `com.motoanjo.app://auth/callback` (appUrlOpen + getLaunchUrl) |
| Sessão Supabase no APK | sessão persistida, guard liberou |
| Dashboard autenticado | abre no aparelho |
| Arquitetura SOS 1B | RPCs, RLS somente-leitura, idempotência, fila WhatsApp |
| Chave/tiles do Google Maps na origem publicada | tiles `maps/api/vt` HTTP 200, sem erro de chave |

## ⚠️ IMPLEMENTADO / AGUARDANDO TESTE FÍSICO

- **Google Maps legível** — causa (contraste do `DARK_STYLE`) corrigida e
  publicada; **aguardando revalidação física no Samsung**.
- GPS em movimento real (watchPosition, follow, precisão).
- SOS físico ponta a ponta: hold 3 s → evento → cancelar → histórico.
- WhatsApp ponta a ponta (Meta Cloud API / fallback `wa.me`).
- Contatos de emergência em aparelho.
- Compartilhamento de localização ao vivo entre usuários.
- Comunidade (posts, comentários, curtidas, alertas) em aparelho.
- Telemetria (velocímetro/inclinação) em movimento.

## ❌ PENDENTE

- Background location / foreground service (hoje o app só rastreia em primeiro plano).
- Push notifications nativas (FCM).
- Release assinado (keystore) e AAB.
- Publicação na Play Store e compliance (política de localização, privacidade).
- Modo offline / cache do bundle no APK (hoje depende do site publicado e de internet).
- Lint global: 684 erros de formatação pré-existentes (majoritariamente Prettier em
  arquivos gerados) — não bloqueiam build nem testes.
