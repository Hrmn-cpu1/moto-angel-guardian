import { useCallback, useEffect, useState } from "react";
import { iniciarServicoDeViagem, pararServicoDeViagem } from "@/lib/trip-service";
import { setTripDiagnosticState } from "@/lib/trip-diagnostics";
import {
  VIAGEM_INICIAL,
  cancelarPreparacao,
  carregarViagem,
  finalizarViagem,
  iniciarViagem,
  receberDestino,
  salvarViagem,
  type Viagem,
} from "@/lib/trip";

/**
 * Fonte única da Viagem Segura.
 *
 * O estado vive no módulo, e não dentro da Home: trocar de aba desmonta a
 * Home, e a viagem não pode morrer com isso. O espelho em `localStorage`
 * cobre o remount completo.
 *
 * A rota /trip continua existindo, mas passa a ler daqui. Duas
 * implementações da mesma viagem divergiriam — já aconteceu com a camada de
 * riders neste projeto.
 */

let viagemAtual: Viagem = { ...VIAGEM_INICIAL };
let hidratado = false;
const assinantes = new Set<(v: Viagem) => void>();

function rotuloDoDestino(v: Viagem): string {
  const d = v.destino;
  if (!d) return "";
  if (d.label) return d.label;
  if (d.address) return d.address;
  if (d.latitude != null && d.longitude != null) {
    return `${d.latitude.toFixed(3)}, ${d.longitude.toFixed(3)}`;
  }
  return "";
}

function publicar(v: Viagem) {
  const anterior = viagemAtual;
  viagemAtual = v;
  setTripDiagnosticState({
    action:
      anterior.estado !== "ativa" && v.estado === "ativa"
        ? "trip_start"
        : anterior.estado === "ativa" && v.estado !== "ativa"
          ? "trip_stop"
          : "trip_state_change",
    tripActive: v.estado === "ativa",
    destinationExists: v.destino != null,
  });
  salvarViagem(v);

  // O serviço nativo acompanha o estado, não o contrário. Idempotente: só age
  // quando a viagem realmente entra ou sai do estado ativo.
  if (anterior.estado !== "ativa" && v.estado === "ativa") {
    // Modo degradado: se o serviço nativo não subir, a viagem continua — o
    // início da viagem nunca pode derrubar a Home.
    void iniciarServicoDeViagem(rotuloDoDestino(v)).catch(() => undefined);
  } else if (anterior.estado === "ativa" && v.estado !== "ativa") {
    void pararServicoDeViagem().catch(() => undefined);
  }

  for (const a of assinantes) a(v);
}

export function useTrip() {
  const [viagem, setViagem] = useState<Viagem>(viagemAtual);

  useEffect(() => {
    assinantes.add(setViagem);
    // A leitura do armazenamento acontece depois da montagem: esta rota roda
    // com SSR, e tocar em localStorage na renderização do servidor quebraria
    // a hidratação.
    if (!hidratado) {
      hidratado = true;
      const recuperada = carregarViagem();
      if (recuperada.estado !== "ocioso") publicar(recuperada);
      else void pararServicoDeViagem(); // sem viagem, nenhum serviço órfão
    }
    setViagem(viagemAtual);
    return () => {
      assinantes.delete(setViagem);
    };
  }, []);

  const definirDestino = useCallback(
    (entrada: unknown, origem: "manual" | "externo" = "manual") => {
      setTripDiagnosticState({ action: "destination_parse" });
      publicar(receberDestino(viagemAtual, entrada, origem));
    },
    [],
  );

  const iniciar = useCallback(() => {
    setTripDiagnosticState({ action: "trip_start_requested" });
    publicar(iniciarViagem(viagemAtual, Date.now()));
  }, []);
  const cancelar = useCallback(() => publicar(cancelarPreparacao(viagemAtual)), []);
  const finalizar = useCallback(
    (sosAtivo: boolean) => publicar(finalizarViagem(viagemAtual, sosAtivo)),
    [],
  );

  return { viagem, definirDestino, iniciar, cancelar, finalizar };
}
