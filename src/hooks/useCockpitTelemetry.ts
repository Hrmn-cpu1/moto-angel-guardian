import { useEffect, useRef, useState } from "react";
import { ouvirPosicaoNativa } from "@/lib/trip-service";
import {
  MODO_INICIAL,
  calcularInclinacao,
  proximoModo,
  rumoCardeal,
  suavizarVelocidade,
  velocidadeKmh,
  type Cardeal,
  type EstadoModo,
  type Inclinacao,
} from "@/lib/ride-telemetry";

/**
 * Telemetria do cockpit a partir de sensores REAIS.
 *
 * Nada aqui é simulado. Sem GPS com velocidade, `velocidade` é `null` e a
 * tela mostra "—". Sem sensor de orientação, a inclinação vem `indisponivel`.
 * Um painel que inventa número para parecer completo é pior que um painel
 * incompleto — quem está pilotando acredita no que lê.
 *
 * O sensor de orientação só é ligado quando a viagem está ativa: manter
 * `deviceorientation` rodando o dia todo gasta bateria sem servir para nada.
 */
export function useCockpitTelemetry(ativo: boolean) {
  const [velocidade, setVelocidade] = useState<number | null>(null);
  const [rumo, setRumo] = useState<Cardeal | null>(null);
  const [inclinacao, setInclinacao] = useState<Inclinacao>({
    graus: null,
    confianca: "indisponivel",
    aviso: "sem sensor de orientação",
  });
  const [modo, setModo] = useState<EstadoModo>(MODO_INICIAL);

  const historico = useRef<number[]>([]);
  const gamma = useRef<number | null>(null);
  const velocidadeRef = useRef<number | null>(null);

  // Posição nativa do serviço de primeiro plano. É a única que continua
  // chegando com a tela apagada; o watchPosition abaixo cobre o navegador e o
  // caso de o serviço não estar disponível.
  useEffect(() => {
    if (!ativo) return;
    return ouvirPosicaoNativa((p) => {
      const bruta = velocidadeKmh({
        speedMs: p.velocidadeMs >= 0 ? p.velocidadeMs : null,
        accuracyM: p.precisaoM >= 0 ? p.precisaoM : null,
      });
      const suave = bruta == null ? null : suavizarVelocidade(historico.current, bruta);
      if (suave != null) historico.current = [...historico.current, suave].slice(-3);
      velocidadeRef.current = suave;
      setVelocidade(suave);
      setModo((m) => proximoModo(m, suave, Date.now()));
    });
  }, [ativo]);

  // GPS: velocidade e rumo.
  useEffect(() => {
    if (!ativo || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const bruta = velocidadeKmh({
          speedMs: pos.coords.speed,
          accuracyM: pos.coords.accuracy,
        });
        const suave =
          bruta == null ? null : suavizarVelocidade(historico.current, bruta);
        if (suave != null) historico.current = [...historico.current, suave].slice(-3);
        velocidadeRef.current = suave;
        setVelocidade(suave);
        setRumo(rumoCardeal(pos.coords.heading, suave));
        setModo((m) => proximoModo(m, suave, Date.now()));
        setInclinacao(calcularInclinacao(gamma.current, suave));
      },
      () => {
        // Falha de GPS não zera a tela com número falso: some o valor.
        velocidadeRef.current = null;
        setVelocidade(null);
        setRumo(null);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [ativo]);

  // Orientação: só durante a viagem.
  useEffect(() => {
    if (!ativo || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
    let ultimo = 0;
    const aoGirar = (e: DeviceOrientationEvent) => {
      gamma.current = e.gamma;
      // O sensor dispara dezenas de vezes por segundo. Reagir a tudo isso no
      // React derruba o desempenho num aparelho intermediário.
      const agora = Date.now();
      if (agora - ultimo < 250) return;
      ultimo = agora;
      setInclinacao(calcularInclinacao(e.gamma, velocidadeRef.current));
    };
    window.addEventListener("deviceorientation", aoGirar);
    return () => window.removeEventListener("deviceorientation", aoGirar);
  }, [ativo]);

  // Ao encerrar a viagem, nada fica pendurado nem congelado na tela.
  useEffect(() => {
    if (ativo) return;
    historico.current = [];
    gamma.current = null;
    velocidadeRef.current = null;
    setVelocidade(null);
    setRumo(null);
    setModo(MODO_INICIAL);
    setInclinacao({ graus: null, confianca: "indisponivel", aviso: "sem sensor de orientação" });
  }, [ativo]);

  return { velocidade, rumo, inclinacao, modo: modo.modo };
}
