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
 * lovable.app, então `window.location.origin` (OAuth do Google) e a chave
 * do Google Maps restrita por referrer funcionam sem gambiarra.
 */
const config: CapacitorConfig = {
  appId: "com.motoanjo.app",
  appName: "Moto Anjo",
  // Exigido pelo CLI mesmo usando server.url; é o output real do build web.
  webDir: "dist/client",
  server: {
    url: "https://moto-angel-guardian.lovable.app",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: [
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
      "wa.me",
      "*.whatsapp.com",
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
