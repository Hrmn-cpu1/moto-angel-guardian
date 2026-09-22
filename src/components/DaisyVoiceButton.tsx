import { Mic, MicOff, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { criarReconhecimentoDaisy, interpretarComando, type DaisyCommand } from "@/lib/daisy";

export function DaisyVoiceButton({
  onCommand,
  variant = "compact",
}: {
  onCommand: (command: DaisyCommand, transcript: string) => void;
  /** Home usa o painel com nome; cockpit preserva o controle compacto. */
  variant?: "compact" | "floating";
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const recognitionRef = useRef<ReturnType<typeof criarReconhecimentoDaisy> | null>(null);
  const onCommandRef = useRef(onCommand);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearListeningTimer = () => {
    if (listeningTimerRef.current) clearTimeout(listeningTimerRef.current);
    listeningTimerRef.current = null;
  };

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    let active = true;
    const recognition = criarReconhecimentoDaisy({
      onResult: (text) => {
        if (!active) return;
        setListening(false);
        clearListeningTimer();
        setError(null);
        setTranscript(text);
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => {
          if (active) setTranscript(null);
        }, 4_500);
        onCommandRef.current(interpretarComando(text), text);
      },
      onError: (message) => {
        if (!active) return;
        setListening(false);
        clearListeningTimer();
        setTranscript(null);
        setError(message);
      },
    });
    recognitionRef.current = recognition;
    void recognition.available().then((value) => {
      if (active) setAvailable(value);
    });
    return () => {
      active = false;
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      clearListeningTimer();
      void recognition.stop();
    };
  }, []);

  const toggle = () => {
    const recognition = recognitionRef.current;
    if (!recognition || available !== true) {
      setError("Comando de voz indisponível neste dispositivo.");
      return;
    }
    setError(null);
    setTranscript(null);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (listening) {
      setListening(false);
      clearListeningTimer();
      void recognition.stop();
    } else {
      setListening(true);
      listeningTimerRef.current = setTimeout(() => {
        setListening(false);
        setError("Não ouvi um comando. Toque e tente novamente.");
        void recognition.stop();
      }, 15_000);
      void recognition.start();
    }
  };

  const status = error ?? (listening ? "Ouvindo…" : transcript ? `Ouvi: ${transcript}` : null);
  const floatingStatus = error ?? (transcript ? `Ouvi: ${transcript}` : null);
  const subtitle = error
    ? "Toque para tentar novamente"
    : listening
      ? "Ouvindo…"
      : transcript
        ? "Comando recebido"
        : "Toque para falar";

  if (variant === "floating") {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={toggle}
          aria-label={listening ? "Parar escuta da DAISY" : "Falar com a DAISY"}
          aria-pressed={listening}
          disabled={available === null}
          className={`group flex h-14 min-w-[136px] items-center gap-2.5 rounded-2xl border px-2.5 pr-3 text-left shadow-[0_14px_36px_rgba(0,0,0,0.55)] backdrop-blur-xl transition active:scale-[0.97] ${
            listening
              ? "border-gold bg-gold text-black ring-4 ring-gold/20"
              : "border-gold/45 bg-map-panel/96 text-foreground"
          } ${available !== true ? "opacity-70" : ""}`}
        >
          <span
            className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              listening ? "bg-black/15 text-black" : "gold-gradient text-black"
            }`}
          >
            {listening && (
              <span className="absolute inset-0 animate-ping rounded-xl border border-black/30" />
            )}
            {listening ? <MicOff size={19} /> : <Mic size={19} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 font-display text-[13px] font-black tracking-[0.12em]">
              DAISY <Sparkles size={12} aria-hidden="true" />
            </span>
            <span className="block truncate text-[10px] font-semibold opacity-75">{subtitle}</span>
          </span>
        </button>

        {floatingStatus && (
          <span
            role="status"
            className="absolute right-[calc(100%+8px)] top-1/2 w-40 -translate-y-1/2 rounded-2xl border border-white/10 bg-black/95 px-3 py-2 text-[11px] leading-snug text-foreground shadow-map"
          >
            {floatingStatus}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={
          listening
            ? "Parar escuta da DAISY"
            : available
              ? "Falar com a DAISY"
              : "DAISY: comando de voz indisponível neste dispositivo"
        }
        aria-pressed={listening}
        disabled={available === null}
        title={available ? "Falar com a DAISY" : "Comando de voz indisponível neste dispositivo"}
        className={`grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-xl border transition active:scale-95 ${
          listening
            ? "border-gold bg-gold text-black ring-4 ring-gold/20"
            : "border-gold/30 bg-gold/10 text-gold"
        } ${available !== true ? "opacity-60" : ""}`}
      >
        {listening ? <MicOff size={18} /> : <Mic size={18} />}
      </button>
      {status && (
        <span
          role="status"
          className="absolute bottom-12 right-0 w-56 rounded-xl bg-black/95 px-3 py-2 text-[11px] text-foreground shadow-map"
        >
          {status}
        </span>
      )}
    </div>
  );
}
