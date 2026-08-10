/**
 * Ponte opcional com o Capacitor.
 *
 * O mesmo código roda no navegador e dentro do APK. Nada aqui pode quebrar
 * quando o Capacitor não existe (web) nem quando o usuário recusa o GPS —
 * o app precisa continuar funcionando com o caminho manual do SOS.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function cap(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

/** true apenas dentro do APK Android/iOS. */
export function isNativeApp(): boolean {
  const c = cap();
  return typeof c?.isNativePlatform === "function" ? c.isNativePlatform() : false;
}

/**
 * Pede a permissão de localização em runtime (Android 6+).
 *
 * Sem isso o WebView nega o `navigator.geolocation` silenciosamente. A recusa
 * não é tratada como erro: o app segue e o próprio fluxo de SOS mostra a
 * mensagem de "permissão negada" quando o usuário aciona.
 */
export async function ensureNativeLocationPermission(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const status = await Geolocation.checkPermissions();
    if (status.location === "granted" || status.coarseLocation === "granted") return;
    await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
  } catch {
    /* plugin ausente ou usuário recusou — o app continua utilizável */
  }
}

/** Esconde a splash nativa assim que o React montou. */
export async function hideNativeSplash(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* sem plugin de splash: nada a fazer */
  }
}

/** Chamado uma vez no boot do app. */
export function bootstrapNative(): void {
  if (!isNativeApp()) return;
  void import("./native-auth").then(({ bootstrapNativeAuth }) => bootstrapNativeAuth());
  void ensureNativeLocationPermission().finally(() => void hideNativeSplash());
}