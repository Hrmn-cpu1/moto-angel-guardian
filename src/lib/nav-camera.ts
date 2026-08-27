/**
 * Câmera de navegação — matemática pura, sem Google.
 *
 * Pilotando, o que importa é a estrada À FRENTE. Manter o motociclista no
 * centro da tela desperdiça metade do mapa com o caminho já percorrido. Aqui
 * calculamos o centro do mapa que coloca a posição real do usuário no terço
 * inferior da área útil — o mesmo comportamento de um navegador dedicado.
 *
 * Nada aqui inventa dado: recebe a posição real e devolve apenas para onde a
 * câmera deve olhar. Sem posição, quem chama não chama.
 */

/** Fração da altura em que o usuário deve aparecer durante a navegação. */
export const FRACAO_DO_USUARIO = 0.68;

/**
 * Deslocamento vertical, em pixels, entre o centro do mapa e o usuário.
 * Positivo = o usuário fica ABAIXO do centro.
 */
export function deslocamentoDaCamera(alturaPx: number, fracao = FRACAO_DO_USUARIO): number {
  if (!Number.isFinite(alturaPx) || alturaPx <= 0) return 0;
  const f = Math.min(0.9, Math.max(0.5, fracao));
  return alturaPx * (f - 0.5);
}

const TAMANHO_DO_LADRILHO = 256;

function latParaY(lat: number): number {
  const rad = (Math.min(85, Math.max(-85, lat)) * Math.PI) / 180;
  const seno = Math.sin(rad);
  return (
    (TAMANHO_DO_LADRILHO / 2) *
    (1 - Math.log((1 + seno) / (1 - seno)) / (2 * Math.PI))
  );
}

function yParaLat(y: number): number {
  const n = Math.PI * (1 - (2 * y) / TAMANHO_DO_LADRILHO);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/**
 * Centro do mapa que deixa `alvo` a `deslocamentoPx` abaixo do centro.
 *
 * Mercator esférico, o mesmo do Google: um pixel em zoom Z vale
 * `1 / (256 * 2^Z)` do mundo. Sem deslocamento devolve o próprio alvo.
 */
export function centroAcimaDoUsuario(
  alvo: { lat: number; lng: number },
  zoom: number,
  deslocamentoPx: number,
): { lat: number; lng: number } {
  if (!Number.isFinite(zoom) || !Number.isFinite(deslocamentoPx) || deslocamentoPx === 0) {
    return alvo;
  }
  const escala = Math.pow(2, zoom);
  const y = latParaY(alvo.lat) - deslocamentoPx / escala;
  return { lat: yParaLat(y), lng: alvo.lng };
}

/**
 * A câmera só se move quando o mundo se moveu.
 *
 * `panTo` a cada tick de GPS parado faz a tela tremer e queima bateria. O
 * limiar é em graus (~1,5 m) porque é o menor movimento que ainda significa
 * alguma coisa em cima de uma moto.
 */
export function precisaMoverCamera(
  anterior: { lat: number; lng: number } | null,
  proximo: { lat: number; lng: number },
  limiteGraus = 0.000013,
): boolean {
  if (!anterior) return true;
  return (
    Math.abs(anterior.lat - proximo.lat) > limiteGraus ||
    Math.abs(anterior.lng - proximo.lng) > limiteGraus
  );
}
