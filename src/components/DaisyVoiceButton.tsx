import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { criarReconhecimentoDaisy, interpretarComando, type DaisyCommand } from "@/lib/daisy";

export function DaisyVoiceButton({
  onCommand,
}: {
  onCommand: (command: DaisyCommand, transcript: string) => void;
}) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<ReturnType<typeof criarReconhecimentoDaisy> | null>(null);

  useEffect(() => {
    const recognition = criarReconhecimentoDaisy({
      onResult: (text) => {
        setListening(false);
        setError(null);
        onCommand(interpretarComando(text), text);
      },
      onError: (message) => {
        setListening(false);
        setError(message);
      },
    });
    recognitionRef.current = recognition;
    setAvailable(recognition.available());
    return () => recognition.stop();
  }, [onCommand]);

  if (!available) return null;

  const toggle = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setError(null);
    if (listening) {
      recognition.stop();
      setListening(false);
    } else {
      recognition.start();
      setListening(true);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? "Parar escuta da DAISY" : "Falar com a DAISY"}
        aria-pressed={listening}
        className={`grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30 text-gold transition ${listening ? "ring-2 ring-gold/50" : ""}`}
      >
        {listening ? <MicOff size={18} /> : <Mic size={18} />}
      </button>
      {error && (
        <span
          role="status"
          className="absolute bottom-12 right-0 w-56 rounded-xl bg-black/95 px-3 py-2 text-[11px] text-muted-foreground shadow-map"
        >
          {error}
        </span>
      )}
    </div>
  );
}
