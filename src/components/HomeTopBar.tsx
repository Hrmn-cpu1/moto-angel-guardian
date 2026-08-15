import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, WifiOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  gpsOnline: boolean;
  sharing?: boolean;
  /** Copiloto avaliando eventos reais neste momento. */
  copilotOnline?: boolean;
  /** Viagem Segura em curso. */
  tripActive?: boolean;
  /**
   * Proteção em segundo plano: um ponto, não um painel.
   *
   * `null` fora do Android — nada a prometer onde o serviço não existe.
   * A descrição vai no title/aria-label porque quem está pilotando não tem
   * espaço para ler um parágrafo aqui; a explicação por extenso mora no
   * painel de preparação, onde ainda dá para resolver.
   */
  segundoPlano?: { ok: boolean; descricao: string } | null;
}

/** Slim translucent status strip floating over the full-screen home map. */
export function HomeTopBar({
  gpsOnline,
  sharing = false,
  copilotOnline = false,
  tripActive = false,
  segundoPlano = null,
}: Props) {
  const { user } = useAuth();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const initial = (user?.name ?? "M").slice(0, 1).toUpperCase();

  const indicadores: Array<[string, boolean, string | null]> = [
    ["GPS", gpsOnline, null],
    ["COPILOT", copilotOnline, null],
    ["VIAGEM", tripActive, null],
  ];
  // Só aparece durante a viagem: fora dela não há serviço a reportar, e um
  // indicador apagado por definição só ensinaria a ignorar indicador.
  if (tripActive && segundoPlano) {
    indicadores.push(["FUNDO", segundoPlano.ok, segundoPlano.descricao]);
  }

  return (
    <div className="pointer-events-auto absolute inset-x-3 top-[var(--ma-top)] z-30 flex items-center gap-2.5 rounded-full border border-gold/25 bg-black/70 px-3 py-1.5 backdrop-blur-md">
      <Link to="/profile" aria-label="Abrir perfil" className="shrink-0">
        {user?.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            width={28}
            height={28}
            className="h-7 w-7 rounded-full border border-gold/40 object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full gold-gradient text-xs font-black text-black">
            {initial}
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-xs font-bold text-foreground">
          {user?.name?.split(" ")[0] ?? "Motociclista"}
        </p>
        <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-widest">
          {indicadores.map(([rotulo, ativo, aviso]) => (
            <span
              key={rotulo}
              title={aviso ?? undefined}
              aria-label={aviso ?? undefined}
              className={`flex items-center gap-1 ${
                ativo ? "text-gold" : aviso ? "text-emergency" : "text-muted-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  ativo ? "bg-gold" : aviso ? "bg-emergency" : "bg-muted-foreground/60"
                }`}
              />
              {rotulo}
            </span>
          ))}
        </div>
      </div>

      {/* Relógio, sinal e bateria já existem na barra do Android: aqui fica
          apenas o que o sistema não mostra — o estado da proteção. */}
      {!online && (
        <WifiOff size={12} className="shrink-0 text-emergency" aria-label="Sem conexão" />
      )}
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-gold">
        {sharing ? "Compartilhando" : gpsOnline ? "Protegido" : "Sem GPS"}
      </span>

      <Link
        to="/notifications"
        aria-label="Notificações"
        className="shrink-0 rounded-full border border-white/10 p-1.5 text-gold"
      >
        <Bell size={14} />
      </Link>
    </div>
  );
}
