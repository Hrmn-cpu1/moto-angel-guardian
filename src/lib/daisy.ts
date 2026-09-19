export type DaisyCommand =
  | { type: "start_trip" }
  | { type: "destination" }
  | { type: "help" }
  | { type: "stop_voice" }
  | { type: "unknown" };

export function normalizarComando(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parser determinístico para os comandos essenciais da DAISY.
 * Não executa ações críticas: "ajuda" apenas solicita confirmação na UI.
 */
export function interpretarComando(texto: string): DaisyCommand {
  const t = normalizarComando(texto);
  if (!t) return { type: "unknown" };

  if (/(iniciar|comecar|comeca).*(viagem|rota)|viagem.*(segura|iniciar)/.test(t)) {
    return { type: "start_trip" };
  }
  if (/(qual|me diga|diga).*(destino|proximo destino)|destino/.test(t)) {
    return { type: "destination" };
  }
  if (/(pedir|preciso de|chamar|ativar).*(ajuda|socorro)|protocolo 1/.test(t)) {
    return { type: "help" };
  }
  if (/(parar|desligar|silenciar).*(voz|daisy|copiloto)/.test(t)) {
    return { type: "stop_voice" };
  }
  return { type: "unknown" };
}

export interface DaisyRecognition {
  start: () => void;
  stop: () => void;
  available: () => boolean;
  onResult?: (text: string) => void;
  onError?: (message: string) => void;
}

type RecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function criarReconhecimentoDaisy(callbacks: {
  onResult: (text: string) => void;
  onError: (message: string) => void;
}): DaisyRecognition {
  let recognition: InstanceType<RecognitionCtor> | null = null;

  return {
    available: () => Boolean(ctor()),
    start: () => {
      const Ctor = ctor();
      if (!Ctor) {
        callbacks.onError("Reconhecimento de voz indisponível neste aparelho.");
        return;
      }
      try {
        recognition = new Ctor();
        recognition.lang = "pt-BR";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (event) => {
          const first = event.results[0]?.[0]?.transcript;
          if (first) callbacks.onResult(first);
        };
        recognition.onerror = (event) =>
          callbacks.onError(event.error ? \`Voz: \${event.error}\` : "Não consegui ouvir você.");
        recognition.start();
      } catch {
        callbacks.onError("Não consegui iniciar o microfone.");
      }
    },
    stop: () => {
      try {
        recognition?.stop();
      } catch {
        // encerramento idempotente
      }
      recognition = null;
    },
  };
}
