import { useEffect, useState } from "react";
import { MapPin, ShieldAlert, Loader2, Crosshair } from "lucide-react";
import { GoldButton } from "./GoldButton";
import { OutlineButton } from "./OutlineButton";

type State = "checking" | "prompt" | "denied" | "unsupported" | "granted" | "requesting";

interface Props {
  onGranted: () => void;
}

export function LocationPermissionGate({ onGranted }: Props) {
  const [state, setState] = useState<State>("checking");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unsupported");
      return;
    }
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms?.query) {
      setState("prompt");
      return;
    }
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        const map = (s: PermissionState): State =>
          s === "granted" ? "granted" : s === "denied" ? "denied" : "prompt";
        setState(map(status.state));
        status.onchange = () => setState(map(status.state));
      })
      .catch(() => setState("prompt"));
  }, []);

  useEffect(() => {
    if (state === "granted") onGranted();
  }, [state, onGranted]);

  const request = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unsupported");
      return;
    }
    setState("requesting");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAccuracy(pos.coords.accuracy);
        setState("granted");
      },
      (err) => {
        setError(err.message);
        setState(err.code === err.PERMISSION_DENIED ? "denied" : "prompt");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  if (state === "granted" || state === "checking") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-xs uppercase tracking-widest text-gold">
        <Loader2 size={14} className="animate-spin" /> Verificando permissões...
      </div>
    );
  }

  const isDenied = state === "denied";
  const isUnsupported = state === "unsupported";

  return (
    <div className="animate-fade-up px-5 pt-4">
      <div className="glass-card rounded-3xl p-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full border ${
                isDenied
                  ? "border-emergency/40 bg-emergency/5 text-emergency"
                  : "border-gold/30 bg-gold/5 text-gold"
              }`}
            >
              {isDenied ? <ShieldAlert size={32} /> : <MapPin size={32} />}
            </div>
            {!isDenied && <div className="absolute inset-0 animate-ping rounded-full bg-gold/10" />}
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {isDenied
              ? "Permissão bloqueada"
              : isUnsupported
                ? "Não suportado"
                : "Localização precisa"}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            {isDenied
              ? "Ative o GPS nas configurações"
              : isUnsupported
                ? "Seu dispositivo não expõe GPS"
                : "Precisamos da sua localização"}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {isDenied
              ? "Você negou o acesso à localização. Para usar o mapa, pontos de apoio e o SOS com precisão, libere a permissão no navegador."
              : isUnsupported
                ? "Não conseguimos acessar o GPS deste navegador. Abra o Moto Anjo em um dispositivo móvel com localização habilitada."
                : "O mapa usa GPS de alta precisão para mostrar sua posição, pontos de apoio próximos e enviar sua localização exata no SOS."}
          </p>

          {accuracy != null && (
            <p className="mt-2 text-[11px] text-gold">
              Precisão detectada: ±{Math.round(accuracy)}m
            </p>
          )}
          {error && <p className="mt-2 text-[11px] text-emergency">{error}</p>}

          <ul className="mt-5 w-full space-y-2 text-left">
            {[
              "Mapa em tempo real com sua posição",
              "Hospitais, postos e oficinas ao redor",
              "SOS envia coordenadas exatas aos contatos",
            ].map((it) => (
              <li
                key={it}
                className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs text-foreground/80"
              >
                <Crosshair size={12} className="text-gold" /> {it}
              </li>
            ))}
          </ul>

          <div className="mt-6 w-full space-y-2">
            {!isUnsupported && (
              <GoldButton onClick={request} disabled={state === "requesting"}>
                {state === "requesting" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Solicitando...
                  </>
                ) : isDenied ? (
                  <>
                    <Crosshair size={14} /> Tentar novamente
                  </>
                ) : (
                  <>
                    <MapPin size={14} /> Permitir localização
                  </>
                )}
              </GoldButton>
            )}
            {isDenied && (
              <OutlineButton
                size="sm"
                onClick={() => {
                  alert(
                    "Como liberar:\n\n1. Toque no cadeado ao lado da URL\n2. Permissões do site → Localização → Permitir\n3. Recarregue a página",
                  );
                }}
              >
                Como liberar nas configurações
              </OutlineButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
