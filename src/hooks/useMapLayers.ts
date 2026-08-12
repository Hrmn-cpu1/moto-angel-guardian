import { useCallback, useEffect, useState } from "react";
import {
  CAMADAS_PADRAO,
  carregarCamadas,
  salvarCamadas,
  type CamadasDoMapa,
} from "@/lib/map-layers";

/**
 * Preferência de camadas do mapa, persistida no aparelho.
 *
 * A leitura acontece depois da montagem: esta rota roda com SSR, e tocar em
 * localStorage durante a renderização do servidor quebraria a hidratação.
 * Até a primeira leitura vale o padrão de fábrica — comunidade desligada,
 * que é o lado seguro.
 */
export function useMapLayers() {
  const [camadas, setCamadas] = useState<CamadasDoMapa>(CAMADAS_PADRAO);

  useEffect(() => {
    setCamadas(carregarCamadas());
  }, []);

  const alternar = useCallback((qual: keyof CamadasDoMapa) => {
    setCamadas((atual) => {
      const proximo = { ...atual, [qual]: !atual[qual] };
      salvarCamadas(proximo);
      return proximo;
    });
  }, []);

  return { camadas, alternar };
}
