import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Moto Anjo — Android (Capacitor)
 *
 * O app é TanStack Start com SSR e server functions (`createServerFn`), que
 * NÃO rodam dentro do APK. Por isso o WebView carrega a versão publicada em
 * vez de arquivos estáticos empacotados: assim o SOS, o histórico e as
 * notificações continuam usando exatamente o backend do Checkpoint 1B.
 *
 * Efeito colateral desejado: a origem do WebView é o próprio domínio
 * publicado, então `window.location.origin` (OAuth do Google) e a chave do
 * Google Maps restrita por referrer funcionam sem gambiarra.
 *
 * POR QUE O APK NÃO EMBUTE O FRONTEND (leia antes de tentar mudar)
 * ---------------------------------------------------------------
 * Existem 8 `createServerFn` em uso, entre elas `triggerSos` — o caminho que
 * registra o SOS no servidor. Elas são servidas pelo host do TanStack Start.
 * Se o WebView passasse a carregar arquivos locais, a origem viraria
 * `https://localhost` e as chamadas para `/_serverFn/...` não achariam
 * ninguém: **o SOS pararia de registrar**. O login Google também quebraria,
 * porque o broker OAuth usa `${origin}/~oauth/initiate`.
 *
 * Ou seja: hoje NÃO dá para tornar o APK autocontido "com segurança". Para
 * isso, as server functions precisam virar Edge Functions do Supabase (ou
 * serviço próprio) primeiro — está descrito em HOSTING-DECOUPLING-PLAN.md,
 * etapa 3.
 *
 * O QUE DÁ PARA FAZER AGORA, E ESTÁ FEITO AQUI
 * -------------------------------------------
 * A URL deixou de ser fixa no código. `MOTOANJO_WEB_URL` define para onde o
 * APK aponta em tempo de build, então o CI pode gerar um APK que carrega a
 * implantação correspondente ao commit que ele acabou de validar — em vez de
 * uma publicação antiga. Sem a variável, cai no padrão de hoje.
 */

/** Para onde o WebView aponta. Trocável em tempo de build pelo CI. */
const URL_PADRAO = "https://moto-angel-guardian.lovable.app";
const urlDoApp = (process.env.MOTOANJO_WEB_URL ?? URL_PADRAO).trim() || URL_PADRAO;

function hostDe(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
}
const config: CapacitorConfig = {
  appId: "com.motoanjo.app",
  appName: "Moto Anjo",
  // Exigido pelo CLI mesmo usando server.url; é o output real do build web.
  webDir: "dist/client",
  server: {
    url: urlDoApp,
    cleartext: false,
    androidScheme: "https",
    allowNavigation: [
      // O host configurado entra primeiro: sem ele, um domínio próprio seria
      // bloqueado pela própria navegação do WebView.
      ...(hostDe(urlDoApp) ? [hostDe(urlDoApp)] : []),
      "moto-angel-guardian.lovable.app",
      "*.lovable.app",
      "oauth.lovable.app",
      "lovable.dev",
      "*.lovable.dev",
      "*.supabase.co",
      "accounts.google.com",
      "*.google.com",
      "*.googleapis.com",
      "*.gstatic.com",
      // `wa.me` e `*.whatsapp.com` saíram daqui de propósito.
      //
      // Estar nesta lista AUTORIZA a WebView principal a navegar para o host.
      // O wa.me responde com redirecionamento para esquema de aplicativo, que
      // a WebView não sabe abrir — era assim que a tela do SOS podia virar uma
      // página de erro. Fora da lista, o Capacitor entrega o link ao sistema,
      // que é o comportamento correto. Todo acesso ao WhatsApp passa por
      // `src/lib/external-navigation.ts`.
    ],
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#050505",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashImmersive: false,
    },
  },
};

export default config;
