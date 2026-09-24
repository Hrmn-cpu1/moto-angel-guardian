/**
 * Voz do copiloto.
 *
 * Usa a Web Speech API (`speechSynthesis`), que existe na WebView do Android
 * quando o aparelho tem motor de TTS instalado — o que é comum, mas **não é
 * garantido**. Por isso o suporte é detectado em execução, e a interface
 * mostra o estado real: se não houver voz, o aviso continua visual e o botão
 * de voz não aparece prometendo algo que não vai acontecer.
 *
 * No APK, a DAISY usa a ponte nativa DaisyTts (Android TextToSpeech).
 * No navegador, speechSynthesis continua como fallback.
 */

export interface AdaptadorDeVoz {
  disponivel: () => boolean;
  falar: (texto: string) => void;
  calar: () => void;
}

type DaisyTtsNative = {
  speak: (options: { text: string }) => Promise<void>;
  stop: () => Promise<void>;
};

type SinteseGlobal = {
  speechSynthesis?: {
    speak: (u: unknown) => void;
    cancel: () => void;
    speaking?: boolean;
  };
  SpeechSynthesisUtterance?: new (t: string) => {
    lang: string;
    rate: number;
    volume: number;
  };
};

function janela(): SinteseGlobal | null {
  return typeof window === "undefined" ? null : (window as unknown as SinteseGlobal);
}

function ttsNativo(): DaisyTtsNative | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        Plugins?: { DaisyTts?: DaisyTtsNative };
      };
    }
  ).Capacitor;
  if (typeof cap?.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
  return cap.Plugins?.DaisyTts ?? null;
}

export const vozDoNavegador: AdaptadorDeVoz = {
  disponivel: () => {
    if (ttsNativo()) return true;
    const w = janela();
    return Boolean(w?.speechSynthesis && w?.SpeechSynthesisUtterance);
  },
  falar: (texto) => {
    const native = ttsNativo();
    if (native) {
      void native.speak({ text: texto }).catch(() => undefined);
      return;
    }
    const w = janela();
    if (!w?.speechSynthesis || !w.SpeechSynthesisUtterance) return;
    try {
      // Um aviso novo cancela o anterior: melhor ouvir o mais urgente do que
      // esperar a fila de um aviso que já passou.
      w.speechSynthesis.cancel();
      const fala = new w.SpeechSynthesisUtterance(texto);
      fala.lang = "pt-BR";
      fala.rate = 1.05;
      fala.volume = 1;
      w.speechSynthesis.speak(fala);
    } catch {
      /* sem voz: o aviso visual continua valendo */
    }
  },
  calar: () => {
    const native = ttsNativo();
    if (native) {
      void native.stop().catch(() => undefined);
      return;
    }
    try {
      janela()?.speechSynthesis?.cancel();
    } catch {
      /* nada a fazer */
    }
  },
};

/**
 * Deve falar agora?
 *
 * Puro, para o teste não depender de aparelho. A voz só entra com a viagem
 * ativa e em movimento: parado, a pessoa está olhando a tela, e um app que
 * fala sozinho no bolso assusta mais do que ajuda.
 */
export function devefalar(ctx: {
  vozLigada: boolean;
  suportada: boolean;
  viagemAtiva: boolean;
  modo: "parado" | "pilotando";
  falarAgora: boolean;
}): boolean {
  return (
    ctx.vozLigada && ctx.suportada && ctx.viagemAtiva && ctx.modo === "pilotando" && ctx.falarAgora
  );
}
