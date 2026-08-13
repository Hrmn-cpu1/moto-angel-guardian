import { useCallback, useEffect, useRef, useState } from "react";
import {
  MEMORIA_INICIAL,
  avaliarCopiloto,
  limparMemoria,
  type MemoriaCopiloto,
} from "@/lib/safety-copilot";
import { devefalar, vozDoNavegador } from "@/lib/voice";
import type { CategoriaEvento, EventoNoMapa } from "@/lib/map-events";

/**
 * Safety Copilot ligado aos dados que o app já tem.
 *
 * Não inventa categoria: só converte o que vem de `nearby_alerts`, dos POIs e
 * dos riders. Categorias que o banco ainda não tem (buraco, blitz) nunca
 * aparecem, porque não existe linha para virar evento.
 */

interface Entrada {
  alerts: Array<{ id: string; type: string; distance_km: number }>;
  pois: Array<{ id?: string; name: string; type?: string; distanceKm?: number }>;
  riders: Array<{ user_id: string; distance_km: number }>;
  viagemAtiva: boolean;
  modo: "parado" | "pilotando";
}

const MAPA_DE_TIPOS: Record<string, CategoriaEvento> = {
  sos: "sos",
  acidente: "acidente",
  perigo: "perigo",
  roubo: "roubo",
  bloqueio: "bloqueio",
};

export function useSafetyCopilot({ alerts, pois, riders, viagemAtiva, modo }: Entrada) {
  const memoria = useRef<MemoriaCopiloto>(MEMORIA_INICIAL);
  const [aviso, setAviso] = useState<EventoNoMapa | null>(null);
  const [vozLigada, setVozLigada] = useState(false);
  const vozSuportada = useRef(false);

  useEffect(() => {
    vozSuportada.current = vozDoNavegador.disponivel();
  }, []);

  useEffect(() => {
    const eventos: EventoNoMapa[] = [
      ...alerts
        .filter((a) => MAPA_DE_TIPOS[a.type])
        .map((a) => ({
          id: a.id,
          categoria: MAPA_DE_TIPOS[a.type],
          distanciaKm: a.distance_km,
        })),
      ...riders.map((r) => ({
        id: `rider:${r.user_id}`,
        categoria: "rider" as const,
        distanciaKm: r.distance_km,
      })),
    ];

    const agora = Date.now();
    const r = avaliarCopiloto(limparMemoria(memoria.current, agora), eventos, agora, modo);
    memoria.current = r.memoria;
    setAviso(
      r.aviso
        ? { id: r.aviso.id, categoria: r.aviso.categoria, distanciaKm: r.aviso.distanciaKm }
        : null,
    );

    if (
      devefalar({
        vozLigada,
        suportada: vozSuportada.current,
        viagemAtiva,
        modo,
        falarAgora: r.falarAgora,
      }) &&
      r.aviso
    ) {
      vozDoNavegador.falar(r.aviso.fala);
    }
  }, [alerts, riders, pois, viagemAtiva, modo, vozLigada]);

  // Sair da viagem cala a voz na hora: nada de frase tocando depois do fim.
  useEffect(() => {
    if (!viagemAtiva) vozDoNavegador.calar();
    return () => vozDoNavegador.calar();
  }, [viagemAtiva]);

  const alternarVoz = useCallback(() => setVozLigada((v) => !v), []);

  return { aviso, vozLigada, vozSuportada: vozSuportada.current, alternarVoz };
}
