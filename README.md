# Moto Anjo

Aplicativo de segurança para motociclistas: SOS com localização, aviso automático
aos contatos de emergência, mapa em tempo real, comunidade, histórico de viagens
e telemetria de pilotagem.

- **Produção**: https://moto-angel-guardian.lovable.app
- **Android**: `com.motoanjo.app` — versionCode 3 / versionName 1.2

## Documentação de handoff

| Arquivo | Conteúdo |
| --- | --- |
| `HANDOFF_MOTO_ANJO.md` | arquitetura real, auth, SOS, banco, Android, Maps |
| `PROJECT_STATUS.md` | o que está validado, o que falta testar, bugs abertos |
| `NEXT_STEPS.md` | roadmap P0→P3 com critérios de aceite |
| `CLAUDE_CONTINUATION_PROMPT.md` | prompt autocontido para continuar com outro agente |
| `.env.example` | nomes das variáveis de ambiente (sem valores reais) |

## Stack

React 19 · TypeScript · Vite 8 · TanStack Start + TanStack Router · TanStack Query ·
Tailwind CSS v4 · shadcn/ui · Supabase · Capacitor 7 (Android) · Google Maps JS API.

## Rodando localmente

Requisitos: Node 22, npm.

```sh
git clone <url-do-repositorio>
cd <pasta>
cp .env.example .env      # preencha com suas chaves
npm ci
npm run dev               # http://localhost:8080
```

## Validação

```sh
npm ci
npm test          # 105 testes
npm run typecheck
npm run lint
npm run build
npx cap sync android
```

## Build do APK Android

Requisitos: JDK 21 (Temurin), Android SDK com platform 35.

```sh
npm ci
npm run build
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleDebug
```

APK gerado em:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Também é possível gerar pelo GitHub Actions: aba **Actions** →
**Android Debug APK (v3)** → **Run workflow** (branch `main`). O APK sai como
artifact `moto-anjo-debug-v3`, com tamanho e SHA-256 no resumo da execução.

> O APK carrega a aplicação publicada (`server.url` em `capacitor.config.ts`),
> por padrão em `https://motoanjo.app.br`.
> Mudanças de frontend só aparecem no aparelho depois de publicar a web.

## Banco de dados

Migrations em `supabase/migrations/` (ordem cronológica). Não edite migrations já
aplicadas; crie uma nova. Tipos gerados em `src/integrations/supabase/types.ts`.
