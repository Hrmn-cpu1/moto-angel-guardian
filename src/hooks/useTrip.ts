import { useCallback, useEffect, useState } from "react";
import {
  assinarEstadoDoServico,
  consultarEstadoDoServico,
  estadoAtualDoServico,
  iniciarServicoDeViagem,
  ouvirEstadoDoServico,
  pararServicoDeViagem,
  type EstadoServicoViagem,
} from "@/lib/trip-service";
import { setTripDiagnosticState } from "@/lib/trip-diagnostics";
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
    void iniciarServicoDeViagem(rotuloDoDestino(v)).catch(() => undefined);
  } else if (anterior.estado === "ativa" && v.estado !== "ativa") {
    void pararServicoDeViagem().catch(() => undefined);
  }

  for (const a of assinantes) a(v);
}

/**
 * O listener nativo de estado vive enquanto o app viver: é uma ponte de
 * processo, como o bootstrap de autenticação. Registrar por montagem criaria e
 * destruiria o listener a cada troca de aba.
 */
let ouvindoServico = false;

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
    setViagem(viagemAtual);
    // Voltar para a tela não pode herdar um estado velho: quem sabe se o
    // serviço está de pé é o Android.
    if (viagemAtual.estado === "ativa") void consultarEstadoDoServico().catch(() => undefined);
    return () => {
      assinantes.delete(setViagem);
      desassinarServico();
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

  return { viagem, servico, definirDestino, iniciar, cancelar, finalizar };
}
