/**
 * Escala de camadas da interface — fonte única.
 *
 * BUG REAL (RC3 #2): com o SOS aberto, o marcador da posição do usuário
 * aparecia POR CIMA do painel. A causa não era o número: era o contexto de
 * empilhamento. `.moto-user-location-marker` usa `z-index: 100000` porque
 * precisa ficar acima das tiles dentro do painel do Google — mas o container
 * do mapa não criava contexto próprio, então esse 100000 escapava e passava a
 * competir de igual para igual com o painel do SOS, que vive muito mais
 * acima na árvore.
 *
 * A correção certa não é baixar o z-index do marcador (isso quebraria a
 * ordem dentro do mapa e voltaria na próxima camada nova). É:
 *
 *   1. isolar o mapa (`isolation: isolate` em `.moto-map-surface`), para que
 *      nada de dentro dele escape;
 *   2. ter UMA escala para o que fica fora do mapa, aqui neste arquivo.
 *
 * Dentro do mapa, a ordem é assunto do Google (panes) e do CSS do overlay.
 * Fora do mapa, é esta escala — e ela é a única.
 */

export const CAMADAS = {
  /** Superfície do mapa. Tudo do Google e dos overlays vive isolado aqui. */
  mapa: 0,
  /** Cartões de contexto que flutuam sobre o mapa (próximo risco, destino). */
  cartoesDoMapa: 10,
  /** Botões do mapa: camadas, centralizar, seguir. */
  controlesDoMapa: 20,
  /** Barra inferior de navegação. */
  navegacao: 30,
  /** Painel de preparação/cockpit ancorado embaixo. */
  painelInferior: 40,
  /** Botão SOS: sempre alcançável, acima da navegação. */
  sos: 50,
  /** Fundo escurecido de um modal. */
  fundoModal: 60,
  /** Painel do SOS ativo. Acima de tudo, sem exceção. */
  painelSos: 70,
} as const;

export type NomeDeCamada = keyof typeof CAMADAS;

/** Classe Tailwind arbitrária para a camada. Evita número solto no JSX. */
export function camada(nome: NomeDeCamada): string {
  return `z-[${CAMADAS[nome]}]`;
}

/**
 * O painel do SOS precisa estar acima de tudo que o mapa desenha.
 * Usado em teste: se alguém criar uma camada nova acima dele, o teste falha.
 */
export function sosEstaNoTopo(): boolean {
  const valores = Object.entries(CAMADAS).filter(([nome]) => nome !== "painelSos");
  return valores.every(([, v]) => v < CAMADAS.painelSos);
}

/** Ordem de pintura, do fundo para a frente. */
export function ordemDeCamadas(): NomeDeCamada[] {
  return (Object.keys(CAMADAS) as NomeDeCamada[]).sort((a, b) => CAMADAS[a] - CAMADAS[b]);
}
