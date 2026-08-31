import { useCallback, useEffect, useRef, useState } from "react";
import {
  COUNTDOWN_PADRAO_S,
  CrashDetectionEngine,
  decidirAcionamento,
  segundosRestantes,
  type EstadoQueda,
} from "@/lib/crash-detection";
import {
  assinarSensoresDeQueda,
  fonteDeMovimento,
  movimentoDisponivel,
  pedirPermissaoDeMovimento,
  type FonteMovimento,
} from "@/lib/crash-sensors";
import { consultarSensoresNativos } from "@/lib/trip-service";
import { registrarEventoDeViagem } from "@/lib/trip-diagnostics";

export interface OpcoesDeteccaoQueda {
  /** Viagem ativa. Fora dela nenhum sensor é ligado. */
  ativo: boolean;
  /** Preferência do usuário. Desligada, o motor nem é alimentado. */
  deteccaoLigada?: boolean;
  /** Lê sensores, mostra tudo, NUNCA aciona SOS. */
  modoDiagnostico?: boolean;
  /** Já existe um SOS aberto? Então não abrimos outro. */
  sosAtivo: boolean;
  /** Aciona o MESMO fluxo de SOS do botão manual. */
  aoAcionarSos: () => void;
}

export interface DeteccaoQueda {
  estado: EstadoQueda;
  motivo: string;
  sinais: string[];
  /** Segundos restantes do countdown; `null` fora dele. */
  segundos: number | null;
  /** Há acelerômetro utilizável neste aparelho? */
  sensoresDisponiveis: boolean;
  /** De onde vêm as amostras: serviço nativo, WebView ou nenhuma. */
  fonte: FonteMovimento;
  /** "estou bem": encerra sem SOS. */
  cancelar: () => void;
  /** "preciso de ajuda": antecipa o SOS. */
  confirmar: () => void;
}

/**
 * Liga os sensores reais ao `CrashDetectionEngine` e, só no fim da máquina de
 * estados, chama o SOS que já existe.
 *
 * Não existe segundo pipeline de emergência: este hook não fala com Supabase,
 * WhatsApp ou GPS de emergência. Ele apenas chama `aoAcionarSos`, que é o
 * mesmo `useSosController.trigger` do botão manual.
 *
 * normal → anomaly → candidate → countdown → (cancelled | sos)
 */
export function useCrashDetection(opcoes: OpcoesDeteccaoQueda): DeteccaoQueda {
  const { ativo, deteccaoLigada = true, modoDiagnostico = false, sosAtivo, aoAcionarSos } = opcoes;

  const engine = useRef<CrashDetectionEngine | null>(null);
  if (engine.current == null) engine.current = new CrashDetectionEngine();

  const [estado, setEstado] = useState<EstadoQueda>("normal");
  const [motivo, setMotivo] = useState("normal");
  const [sinais, setSinais] = useState<string[]>([]);
  const [segundos, setSegundos] = useState<number | null>(null);
  const [sensoresDisponiveis, setSensoresDisponiveis] = useState(false);
  const [fonte, setFonte] = useState<FonteMovimento>("nenhuma");

  const inicioCountdown = useRef<number | null>(null);
  // Uma queda = no máximo um SOS. Sem esta trava, cada tick do countdown
  // poderia abrir um evento novo.
  const jaAcionou = useRef(false);
  const acionarRef = useRef(aoAcionarSos);
  acionarRef.current = aoAcionarSos;
  const sosAtivoRef = useRef(sosAtivo);
  sosAtivoRef.current = sosAtivo;

  const dispararSeDevido = useCallback(
    (estadoAtual: EstadoQueda) => {
      const decisao = decidirAcionamento({
        deteccaoLigada,
        modoDiagnostico,
        sosAtivo: sosAtivoRef.current,
        estado: estadoAtual,
      });
      registrarEventoDeViagem("crash.decision", { detalhe: decisao.motivo });
      if (!decisao.acionar || jaAcionou.current) return;
      jaAcionou.current = true;
      acionarRef.current();
    },
    [deteccaoLigada, modoDiagnostico],
  );

  // Captura física. Um único assinante por montagem; a fonte é singleton.
  useEffect(() => {
    if (!ativo || !deteccaoLigada) return;
    setSensoresDisponiveis(movimentoDisponivel());
    void pedirPermissaoDeMovimento().then((r) => setSensoresDisponiveis(r === "disponivel"));
    // O serviço nativo tem a palavra final: ele lê o hardware de verdade e
    // continua lendo com a WebView suspensa.
    void consultarSensoresNativos().then((s) => {
      if (s.aceleracao) setSensoresDisponiveis(true);
    });

    engine.current?.reset();
    jaAcionou.current = false;
    inicioCountdown.current = null;
    setEstado("normal");
    setSegundos(null);

    const cancelar = assinarSensoresDeQueda((amostra) => {
      const r = engine.current!.processar(amostra);
      setEstado(r.estado);
      setMotivo(r.motivo);
      setSinais(r.sinais);
      if (r.estado === "countdown" && inicioCountdown.current == null) {
        inicioCountdown.current = Date.now();
        registrarEventoDeViagem("crash.countdown.start", { detalhe: r.sinais.join("+") });
        setSegundos(COUNTDOWN_PADRAO_S);
      }
    });
    registrarEventoDeViagem("crash.capture.start");
    // A fonte pode trocar durante a viagem (nativo cai, WebView assume e
    // vice-versa). A tela precisa refletir isso sem mentir.
    const relogioDeFonte = window.setInterval(() => setFonte(fonteDeMovimento()), 1000);
    return () => {
      window.clearInterval(relogioDeFonte);
      cancelar();
      registrarEventoDeViagem("crash.capture.stop");
    };
  }, [ativo, deteccaoLigada]);

  // Countdown: relógio próprio, porque o sensor pode parar de emitir.
  useEffect(() => {
    if (estado !== "countdown" || inicioCountdown.current == null) return;
    const tick = () => {
      const restante = segundosRestantes(inicioCountdown.current!, Date.now());
      setSegundos(restante);
      if (restante === 0) {
        const r = engine.current!.confirmar();
        setEstado(r.estado);
        setMotivo(r.motivo);
        dispararSeDevido(r.estado);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [estado, dispararSeDevido]);

  const cancelar = useCallback(() => {
    const r = engine.current!.cancelar();
    inicioCountdown.current = null;
    jaAcionou.current = false;
    setSegundos(null);
    setEstado(r.estado);
    setMotivo(r.motivo);
    setSinais([]);
    registrarEventoDeViagem("crash.cancelled");
    // Volta a vigiar: cancelar uma suspeita não desliga a proteção.
    window.setTimeout(() => {
      engine.current?.reset();
      setEstado("normal");
    }, 0);
  }, []);

  const confirmar = useCallback(() => {
    const r = engine.current!.confirmar();
    inicioCountdown.current = null;
    setSegundos(0);
    setEstado(r.estado);
    setMotivo(r.motivo);
    dispararSeDevido(r.estado);
  }, [dispararSeDevido]);

  return { estado, motivo, sinais, segundos, sensoresDisponiveis, fonte, cancelar, confirmar };
}
