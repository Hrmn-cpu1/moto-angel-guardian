/**
 * Rota interna do Moto Anjo — parte pura.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * A rota era pedida no navegador com `google.maps.DirectionsService`. Prova de
 * campo no site publicado (2026-08-25):
 *
 *   Directions Service: This API key is not authorized to use this service…
 *   MapsRequestError: DIRECTIONS_ROUTE: REQUEST_DENIED
 *
 * A chave de navegador (gerenciada) autoriza SOMENTE Maps JavaScript e Places
 * (New). Directions não. Por isso o destino era aceito, a viagem virava
 * "ativa" e nenhuma linha aparecia: cada pedido morria em REQUEST_DENIED.
 *
 * A rota passa a ser calculada no servidor pela Routes API (chave de servidor,
 * já autorizada — verificado com HTTP 200), e o mapa apenas DESENHA o traçado
 * que chegou. Este módulo é a parte sem rede: decodificação da polilinha,
 * leitura da resposta e classificação de falha. Puro para poder ser testado.
 */

export interface PontoDaRota {
  lat: number;
  lng: number;
}

export interface PassoDaRota {
  distanciaM: number;
  instrucao: string | null;
  manobra: string | null;
  fim: PontoDaRota | null;
}

export interface RotaCalculada {
  distanciaM: number;
  duracaoS: number;
  /** Traçado real devolvido pelo Google, já decodificado. */
  pontos: PontoDaRota[];
  passos: PassoDaRota[];
  destinoTexto: string | null;
}

/**
 * Decodifica a polilinha codificada do Google (algoritmo oficial, precisão 5).
 *
 * Escrito à mão de propósito: a biblioteca `geometry` do Maps JS resolveria
 * isso, mas ela viria da mesma chave restrita e o decodificador precisa rodar
 * em teste, sem navegador.
 */
export function decodificarPolyline(codificada: string | null | undefined): PontoDaRota[] {
  if (!codificada) return [];
  const pontos: PontoDaRota[] = [];
  let indice = 0;
  let lat = 0;
  let lng = 0;

  while (indice < codificada.length) {
    let resultado = 0;
    let deslocamento = 0;
    let byte: number;
    do {
      byte = codificada.charCodeAt(indice++) - 63;
      if (Number.isNaN(byte)) return pontos;
      resultado |= (byte & 0x1f) << deslocamento;
      deslocamento += 5;
    } while (byte >= 0x20);
    lat += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;

    resultado = 0;
    deslocamento = 0;
    do {
      byte = codificada.charCodeAt(indice++) - 63;
      if (Number.isNaN(byte)) return pontos;
      resultado |= (byte & 0x1f) << deslocamento;
      deslocamento += 5;
    } while (byte >= 0x20);
    lng += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;

    pontos.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pontos;
}

/** "464s" -> 464. Qualquer coisa fora disso vira 0, nunca NaN na tela. */
export function segundosDaDuracao(valor: unknown): number {
  if (typeof valor === "number" && Number.isFinite(valor)) return Math.max(0, valor);
  if (typeof valor !== "string") return 0;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(valor.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Manobra da Routes API -> vocabulário do Directions, que o cockpit já lê.
 *
 * `setaDaManobra` procura "left"/"right"/"uturn"/"roundabout" em minúsculas;
 * a Routes API devolve `TURN_LEFT`, `ROUNDABOUT_RIGHT`, `UTURN_LEFT`. Só o
 * caixa-baixa já casaria, mas normalizar aqui deixa a intenção explícita.
 */
export function manobraNormalizada(bruta: unknown): string | null {
  if (typeof bruta !== "string" || !bruta.trim()) return null;
  return bruta.trim().toLowerCase().replace(/_/g, "-");
}

interface RespostaRoutes {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
    legs?: Array<{
      steps?: Array<{
        distanceMeters?: number;
        endLocation?: { latLng?: { latitude?: number; longitude?: number } };
        navigationInstruction?: { instructions?: string; maneuver?: string };
      }>;
    }>;
  }>;
}

/**
 * Lê a resposta da Routes API. `null` quando não existe rota utilizável —
 * quem chama trata como "sem rota", nunca inventa distância.
 */
export function mapearRotaDaResposta(
  bruta: unknown,
  destinoTexto: string | null = null,
): RotaCalculada | null {
  const dados = bruta as RespostaRoutes | null;
  const rota = dados?.routes?.[0];
  if (!rota) return null;
  const pontos = decodificarPolyline(rota.polyline?.encodedPolyline);
  if (pontos.length < 2) return null;

  const passos: PassoDaRota[] = (rota.legs ?? []).flatMap((perna) =>
    (perna.steps ?? []).map((passo) => {
      const lat = passo.endLocation?.latLng?.latitude;
      const lng = passo.endLocation?.latLng?.longitude;
      return {
        distanciaM: typeof passo.distanceMeters === "number" ? passo.distanceMeters : 0,
        instrucao: passo.navigationInstruction?.instructions?.replace(/\s+/g, " ").trim() || null,
        manobra: manobraNormalizada(passo.navigationInstruction?.maneuver),
        fim:
          typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat)
            ? { lat, lng }
            : null,
      };
    }),
  );

  return {
    distanciaM: typeof rota.distanceMeters === "number" ? rota.distanceMeters : 0,
    duracaoS: segundosDaDuracao(rota.duration),
    pontos,
    passos,
    destinoTexto,
  };
}

/**
 * Traduz a falha HTTP da Routes API para o mesmo vocabulário que
 * `directions-status.ts` já classifica — assim a interface de erro, o botão de
 * repetir e a espera de cota continuam valendo sem lógica nova.
 */
export function statusDeFalhaHttp(status: number, corpo = ""): string {
  const texto = corpo.toUpperCase();
  if (status === 403 || status === 401) return "REQUEST_DENIED";
  if (status === 429) return "OVER_QUERY_LIMIT";
  if (status === 400) {
    return texto.includes("NOT_FOUND") ? "NOT_FOUND" : "INVALID_REQUEST";
  }
  if (status === 404) return "NOT_FOUND";
  return "UNKNOWN_ERROR";
}

/**
 * Passos do enquadramento inicial em pontos do traçado.
 *
 * O enquadramento antigo usava `step.end_location` do Directions. Aqui a mesma
 * ideia: usuário + trecho seguinte, sem jogar o zoom para longe.
 */
export function fimDosPassos(passos: PassoDaRota[], quantos: number): PontoDaRota[] {
  return passos
    .slice(0, Math.max(0, quantos))
    .map((p) => p.fim)
    .filter((p): p is PontoDaRota => p != null);
}

/**
 * Uma viagem só pode ser considerada pronta quando existe rota de verdade
 * para o destino escolhido. Sem isto, o app entrava em "VIAGEM ATIVA" com o
 * mapa vazio — exatamente a falha relatada em campo.
 */
export function viagemPodeFicarPronta(temDestino: boolean, rota: RotaCalculada | null): boolean {
  if (!temDestino) return true;
  return rota != null && rota.pontos.length >= 2;
}
