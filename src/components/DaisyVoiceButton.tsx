import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { criarReconhecimentoDaisy, interpretarComando, type DaisyCommand } from "@/lib/daisy";

export function DaisyVoiceButton({
  onCommand,
}: {
  onCommand: (command: DaisyCommand, transcript: string) => void;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const recognitionRef = useRef<ReturnType<typeof criarReconhecimentoDaisy> | null>(null);
  const onCommandRef = useRef(onCommand);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    let active = true;
    const recognition = criarReconhecimentoDaisy({
      onResult: (text) => {
        if (!active) return;
        setListening(false);
        setError(null);
        setTranscript(text);
        onCommandRef.current(interpretarComando(text), text);
      },
      onError: (message) => {
        if (!active) return;
        setListening(false);
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
    if (listening) {
      setListening(false);
      void recognition.stop();
    } else {
      setListening(true);
      void recognition.start();
    }
  };

  const status = error ?? (listening ? "Ouvindo…" : transcript ? `Ouvi: ${transcript}` : null);

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
        className={`grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30 text-gold transition ${listening ? "ring-2 ring-gold/50" : ""} ${available !== true ? "opacity-60" : ""}`}
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
