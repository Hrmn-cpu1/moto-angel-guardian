/**
 * Eventos do mapa — categoria, prioridade e o que mostrar.
 *
 * O mapa hoje parece "Google Maps escuro com círculos". O problema não é
 * estético: manchas grandes escondem nome de rua e não respondem as únicas
 * perguntas que importam para quem está pilotando — o que é, onde, a que
 * distância e se precisa agir agora.
 *
 * Este módulo é a linguagem visual em forma de dado. Ele decide a categoria,
 * a prioridade e qual é o único evento que merece um cartão na tela.
 *
 * CATEGORIAS SUPORTADAS PELO BANCO HOJE: sos, acidente, perigo, bloqueio,
 * roubo (community_alerts) e os POIs de apoio. `buraco` e `blitz` estão
 * modelados aqui porque a interface precisa deles, mas **o banco ainda não
 * tem esses tipos** — nenhum dado é inventado: sem linha no banco, nenhum
 * pino aparece. Ver "o que falta" no fim do arquivo.
 */

export type CategoriaEvento =
  | "sos"
  | "acidente"
  | "perigo"
  | "roubo"
  | "bloqueio"
  | "buraco"
  | "blitz"
  | "posto"
  | "oficina"
  | "hospital"
  | "rider";

/** P0 é o mais urgente. A ordem aqui é a ordem de atenção. */
export type Prioridade = 0 | 1 | 2 | 3 | 4 | 5;

export interface AparenciaEvento {
  prioridade: Prioridade;
  rotulo: string;
  /** Forma do pino: cor sozinha não diferencia para quem não distingue cores. */
  forma: "losango" | "triangulo" | "circulo" | "quadrado" | "gota";
  cor: string;
  /** Só o topo da lista pulsa. Mapa inteiro piscando não comunica nada. */
  pulsa: boolean;
}

const VERMELHO = "#D92323";
const AMBAR = "#E8A317";
const DOURADO = "#D4AF37";
const AZUL = "#4A9DD4";

export const APARENCIA: Record<CategoriaEvento, AparenciaEvento> = {
  sos: {
    prioridade: 0,
    rotulo: "SOS de motociclista",
    forma: "losango",
    cor: VERMELHO,
    pulsa: true,
  },
  acidente: { prioridade: 1, rotulo: "Acidente", forma: "triangulo", cor: VERMELHO, pulsa: false },
  roubo: { prioridade: 1, rotulo: "Roubo", forma: "triangulo", cor: VERMELHO, pulsa: false },
  perigo: { prioridade: 2, rotulo: "Perigo", forma: "triangulo", cor: AMBAR, pulsa: false },
  blitz: { prioridade: 3, rotulo: "Fiscalização", forma: "quadrado", cor: AMBAR, pulsa: false },
  bloqueio: { prioridade: 3, rotulo: "Bloqueio", forma: "quadrado", cor: AMBAR, pulsa: false },
  buraco: { prioridade: 3, rotulo: "Buraco", forma: "circulo", cor: AMBAR, pulsa: false },
  hospital: { prioridade: 4, rotulo: "Hospital", forma: "gota", cor: AZUL, pulsa: false },
  posto: { prioridade: 5, rotulo: "Posto", forma: "gota", cor: DOURADO, pulsa: false },
  oficina: { prioridade: 5, rotulo: "Oficina", forma: "gota", cor: DOURADO, pulsa: false },
  rider: { prioridade: 5, rotulo: "Motociclista", forma: "circulo", cor: DOURADO, pulsa: false },
};

export interface EventoNoMapa {
  id: string;
  categoria: CategoriaEvento;
  distanciaKm: number;
  criadoEm?: number;
}

/** Categorias que o banco realmente alimenta hoje. */
export const CATEGORIAS_COM_DADOS: CategoriaEvento[] = [
  "sos",
  "acidente",
  "perigo",
  "roubo",
  "bloqueio",
  "posto",
  "oficina",
  "hospital",
  "rider",
];

export function temDadosNoBackend(c: CategoriaEvento): boolean {
  return CATEGORIAS_COM_DADOS.includes(c);
}

/**
 * Ordena por atenção: prioridade primeiro, distância como desempate.
 * Um SOS a 3 km vem antes de um buraco a 100 m — e é isso que se quer.
 */
export function ordenarPorAtencao(eventos: EventoNoMapa[]): EventoNoMapa[] {
  return [...eventos].sort((a, b) => {
    const pa = APARENCIA[a.categoria].prioridade;
    const pb = APARENCIA[b.categoria].prioridade;
    if (pa !== pb) return pa - pb;
    return a.distanciaKm - b.distanciaKm;
  });
}

/** Além disto, o evento não é problema de agora. */
export const ALCANCE_DO_CARTAO_KM: Record<Prioridade, number> = {
  0: 5,
  1: 3,
  2: 2,
  3: 1,
  4: 1.5,
  5: 0,
};

/**
 * O ÚNICO evento que ganha cartão na tela.
 *
 * Um por vez, sempre. Cinco cartões concorrendo é ruído; e ruído durante
 * pilotagem faz a pessoa parar de olhar — inclusive quando aparecer o que
 * importa. POIs (prioridade 5) nunca viram cartão: são consulta, não alerta.
 */
export function eventoParaCartao(
  eventos: EventoNoMapa[],
  modo: "parado" | "pilotando" = "pilotando",
): EventoNoMapa | null {
  const candidatos = ordenarPorAtencao(eventos).filter((e) => {
    const p = APARENCIA[e.categoria].prioridade;
    const alcance = ALCANCE_DO_CARTAO_KM[p];
    if (alcance === 0) return false;
    // Parado, faz sentido enxergar um pouco mais longe: dá para decidir rota.
    return e.distanciaKm <= (modo === "parado" ? alcance * 2 : alcance);
  });
  return candidatos[0] ?? null;
}

/** Distância em texto curto, do jeito que se lê de relance. */
export function distanciaCurta(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

/* ================================================================== *
 * Áreas de risco
 * ================================================================== */

/**
 * Raio da mancha de risco.
 *
 * Antes eram círculos de 600 m em três faixas sobrepostas, o que pintava
 * bairros inteiros de vermelho e apagava o nome das ruas. O raio agora é
 * contextual e limitado: risco é contexto, não é a informação principal.
 */
export function raioDeRisco(ocorrencias: number): number {
  const base = 120;
  const porOcorrencia = 40;
  return Math.min(400, base + ocorrencias * porOcorrencia);
}

/** Opacidade máxima da mancha. Acima disto, o mapa vira decoração. */
export const OPACIDADE_MAXIMA_RISCO = 0.14;

export function opacidadeDeRisco(ocorrencias: number): number {
  return Math.min(OPACIDADE_MAXIMA_RISCO, 0.05 + ocorrencias * 0.02);
}

/* ================================================================== *
 * O QUE FALTA NO BACKEND (não inventar dado)
 *
 *   buraco  — não existe em community_alerts.type. Precisa de migration
 *             aditiva no CHECK e de um item no formulário de alertas.
 *   blitz   — idem.
 *
 * Enquanto não existirem, a interface está pronta e nenhum pino aparece,
 * porque não há linha no banco. É o comportamento correto: melhor faltar
 * categoria do que inventar ocorrência que ninguém reportou.
 * ================================================================== */
