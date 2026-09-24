export type DaisyCommand =
  | { type: "start_trip" }
  | { type: "destination" }
  | { type: "help" }
  | { type: "confirm_sos" }
  | { type: "cancel_sos" }
  | { type: "protection_status" }
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

  // Consulta antes de comando: "status da viagem segura" contém as palavras
  // viagem/segura, mas não pode ser confundida com pedido para iniciar.
  if (/(estou|esta|status|situacao).*(protegido|protegida|protecao|viagem segura)/.test(t)) {
    return { type: "protection_status" };
  }
  if (
    /(iniciar|inicia|comecar|comeca|ligar|liga|ativar|ativa).*(viagem|rota|protecao)|(viagem|protecao).*(segura|iniciar|inicia|ligar|liga|ativar|ativa)|vamos (rodar|nessa|viajar)/.test(
      t,
    )
  ) {
    return { type: "start_trip" };
  }
  if (/(qual|me diga|diga).*(destino|proximo destino)|destino/.test(t)) {
    return { type: "destination" };
  }
  if (
    /(confirmar|confirma|pode mandar|pode enviar|envia|mande).*(sos|socorro|ajuda)|^(sim|confirmo)$/.test(
      t,
    )
  ) {
    return { type: "confirm_sos" };
  }
  if (/(cancelar|cancela|nao mandar|nao enviar|desistir).*(sos|socorro|ajuda)/.test(t)) {
    return { type: "cancel_sos" };
  }
  if (
    /(sos|socorro|emergencia|preciso de ajuda|me ajuda|pedir ajuda|chamar ajuda|ativar ajuda|protocolo 1)/.test(
      t,
    )
  ) {
    return { type: "help" };
  }
  if (/(parar|desligar|silenciar).*(voz|daisy|copiloto)/.test(t)) {
    return { type: "stop_voice" };
  }
  return { type: "unknown" };
}

export interface DaisyRecognition {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  available: () => Promise<boolean>;
  onResult?: (text: string) => void;
  onError?: (message: string) => void;
}

type DaisyNativePlugin = {
  available: () => Promise<{ available?: boolean }>;
  start: (options?: { language?: string }) => Promise<{ text?: string }>;
  stop: () => Promise<void>;
};

function pluginNativo(): DaisyNativePlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        Plugins?: { DaisySpeech?: DaisyNativePlugin };
      };
    }
  ).Capacitor;
  if (typeof cap?.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
  return cap.Plugins?.DaisySpeech ?? null;
}

function mensagemDoErro(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Não consegui reconhecer sua voz.";
}

function codigoDoErro(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function criarReconhecimentoDaisy(callbacks: {
  onResult: (text: string) => void;
  onError: (message: string) => void;
}): DaisyRecognition {
  let recognition: SpeechRecognitionLike | null = null;

  return {
    available: async () => {
      const native = pluginNativo();
      if (native) {
        try {
          return (await native.available()).available === true;
        } catch {
          return false;
        }
      }
      return Boolean(ctor());
    },
    start: async () => {
      const native = pluginNativo();
      if (native) {
        try {
          const result = await native.start({ language: "pt-BR" });
          const text = result.text?.trim();
          if (text) callbacks.onResult(text);
          else callbacks.onError("Não entendi. Fale novamente.");
        } catch (error) {
          if (codigoDoErro(error) !== "DAISY_CANCELLED") callbacks.onError(mensagemDoErro(error));
        }
        return;
      }

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
          callbacks.onError(event.error ? `Voz: ${event.error}` : "Não consegui ouvir você.");
        recognition.start();
      } catch {
        callbacks.onError("Não consegui iniciar o microfone.");
      }
    },
    stop: async () => {
      const native = pluginNativo();
      if (native) {
        try {
          await native.stop();
        } catch {
          // Encerramento idempotente.
        }
        return;
      }
      try {
        recognition?.stop();
      } catch {
        // encerramento idempotente
      }
      recognition = null;
    },
  };
}
