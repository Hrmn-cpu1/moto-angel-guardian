import { useCallback, useEffect, useState } from "react";
import {
  assinarEstadoDoServico,
  consultarEstadoDoServico,
  estadoAtualDoServico,
  iniciarServicoDeViagem,
  ouvirEstadoDoServico,
  pararServicoDeViagem,
  servicoDisponivel,
  type EstadoServicoViagem,
} from "@/lib/trip-service";
import {
  marcarSessaoFinalizada,
  registrarEventoDeViagem,
  sessaoAnteriorTerminouMal,
  setTripDiagnosticState,
} from "@/lib/trip-diagnostics";
import { reconciliarViagem, type EstadoNativo } from "@/lib/protecao";
import {
  VIAGEM_INICIAL,
  cancelarPreparacao,
  carregarViagem,
  finalizarViagem,
  iniciarViagem,
  receberDestino,
  rotuloDoDestino,
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
/** Uma única tentativa de recuperação por transição de viagem (P1 §7). */
let jaTentouRecuperar = false;
const assinantes = new Set<(v: Viagem) => void>();

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
  // Modo degradado: se o serviço nativo não subir, a viagem continua — o
  // início da viagem nunca pode derrubar a Home.
  if (anterior.estado !== "ativa" && v.estado === "ativa") {
    jaTentouRecuperar = false;
    registrarEventoDeViagem("trip.state.active");
    void iniciarServicoDeViagem(rotuloDoDestino(v)).catch(() => undefined);
  } else if (anterior.estado === "ativa" && v.estado !== "ativa") {
    jaTentouRecuperar = false;
    registrarEventoDeViagem("trip.stop");
    void pararServicoDeViagem().catch(() => undefined);
    // Fim limpo: sem esta marca, o próximo boot leria a trilha como sessão
    // interrompida e o diagnóstico apontaria um crash que não houve.
    marcarSessaoFinalizada();
  }

  for (const a of assinantes) a(v);
}

/**
 * O listener nativo de estado vive enquanto o app viver: é uma ponte de
 * processo, como o bootstrap de autenticação. Registrar por montagem criaria e
 * destruiria o listener a cada troca de aba.
 */
let ouvindoServico = false;

/**
 * Reconcilia o que o JS acha com o que o Android sabe.
 *
 * O caso perigoso é `localStorage` dizer "viagem ativa" depois de o processo
 * ter morrido: sem isto a Home volta anunciando proteção que não existe. Uma
 * tentativa de recuperação; se falhar, a viagem continua, mas o estado do
 * serviço fica `inativo` e a interface passa a dizer só "Viagem ativa".
 */
export async function reconciliarComServico(): Promise<void> {
  if (!servicoDisponivel()) return;
  const estado = await consultarEstadoDoServico();
  const nativo: EstadoNativo = estado.ativo
    ? "ativo"
    : estado.motivo === "sem_plugin"
      ? "desconhecido"
      : "inativo";
  const acao = reconciliarViagem({
    viagemAtiva: viagemAtual.estado === "ativa",
    nativo,
    jaTentouRecuperar,
    temServico: true,
  });
  if (acao === "tentar_recuperar") {
    jaTentouRecuperar = true;
    await iniciarServicoDeViagem(rotuloDoDestino(viagemAtual));
  } else if (acao === "parar_orfao") {
    await pararServicoDeViagem();
  }
}

export function useTrip() {
  const [viagem, setViagem] = useState<Viagem>(viagemAtual);
  // Estado REAL do serviço de primeiro plano — nunca deduzido do estado da
  // viagem. Viagem ativa e serviço recusado é uma combinação possível, e é
  // exatamente ela que a tela precisa conseguir mostrar.
  const [servico, setServico] = useState<EstadoServicoViagem>(estadoAtualDoServico);

  useEffect(() => {
    assinantes.add(setViagem);
    const desassinarServico = assinarEstadoDoServico(setServico);
    if (!ouvindoServico) {
      ouvindoServico = true;
      // O store publica para todos os assinantes; aqui só ligamos o cano.
      ouvirEstadoDoServico(() => {});
    }
    setServico(estadoAtualDoServico());
    // A leitura do armazenamento acontece depois da montagem: esta rota roda
    // com SSR, e tocar em localStorage na renderização do servidor quebraria
    // a hidratação.
    if (!hidratado) {
      hidratado = true;
      const recuperada = carregarViagem();
      if (recuperada.estado !== "ocioso") publicar(recuperada);
      else void pararServicoDeViagem().catch(() => undefined); // sem viagem, nenhum serviço órfão
    }
    // Marco de boot + veredito honesto sobre a sessão anterior. É isto que
    // transforma "o app fechou sozinho" em dado verificável no próximo teste.
    registrarEventoDeViagem("app.boot");
    if (sessaoAnteriorTerminouMal()) registrarEventoDeViagem("session.previous.unfinished");
    setViagem(viagemAtual);
    // Voltar para a tela não pode herdar um estado velho: quem sabe se o
    // serviço está de pé é o Android.
    void reconciliarComServico().catch(() => undefined);
    /**
     * Pulso da viagem ativa.
     *
     * Sem ele, uma viagem que morre em silêncio deixa como último registro o
     * evento de início — e não dá para distinguir "parou de gravar" de "nada
     * aconteceu". Com o pulso, o intervalo entre o último batimento e o boot
     * seguinte mostra QUANDO o processo caiu.
     */
    const pulso = window.setInterval(() => {
      if (viagemAtual.estado === "ativa") registrarEventoDeViagem("trip.heartbeat");
    }, 15_000);

    const aoVoltar = () => {
      if (document.visibilityState === "visible") {
        registrarEventoDeViagem("app.resume");
        void reconciliarComServico().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      assinantes.delete(setViagem);
      desassinarServico();
      window.clearInterval(pulso);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  const definirDestino = useCallback(
    (entrada: unknown, origem: "manual" | "externo" = "manual") => {
      setTripDiagnosticState({ action: "destination_parse" });
      registrarEventoDeViagem("destination.selected", { detalhe: origem });
      publicar(receberDestino(viagemAtual, entrada, origem));
    },
    [],
  );

  const iniciar = useCallback(() => {
    setTripDiagnosticState({ action: "trip_start_requested" });
    registrarEventoDeViagem("trip.start.request");
    publicar(iniciarViagem(viagemAtual, Date.now()));
  }, []);
  const cancelar = useCallback(() => publicar(cancelarPreparacao(viagemAtual)), []);
  const finalizar = useCallback(
    (sosAtivo: boolean) => publicar(finalizarViagem(viagemAtual, sosAtivo)),
    [],
  );

  return { viagem, servico, definirDestino, iniciar, cancelar, finalizar };
}
