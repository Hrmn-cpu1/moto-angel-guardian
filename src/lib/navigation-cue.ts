/**
 * Quantos passos da rota entram no enquadramento inicial.
 *
 * Enquadrar a rota inteira joga o zoom para longe e some com as ruas — inútil
 * para quem vai virar na próxima esquina. Enquadrar só o usuário esconde para
 * onde ele vai. O meio-termo é: usuário + o trecho seguinte até ~1,5 km.
 *
 * Sempre devolve pelo menos 1 quando existe algum passo.
 */
export function passosDoEnquadramento(distanciasM: number[], limiteM = 1500): number {
  if (distanciasM.length === 0) return 0;
  let acumulado = 0;
  for (let i = 0; i < distanciasM.length; i++) {
    acumulado += Math.max(0, distanciasM[i] ?? 0);
    if (acumulado >= limiteM) return i + 1;
  }
  return distanciasM.length;
}
/**
 * Pista de navegação — próxima manobra em forma legível de relance.
 *
 * Puro de propósito: recebe o que o Google devolveu no passo da rota e
 * transforma em seta, distância e rua. Nada é estimado — sem passo real,
 * tudo volta `null` e a interface simplesmente não mostra a faixa.
 */

export type SetaDeManobra = "esquerda" | "direita" | "frente" | "retorno" | "rotatoria";

/** Converte o código de manobra do Google numa das cinco setas do cockpit. */
export function setaDaManobra(manobra: string | null | undefined): SetaDeManobra {
  if (!manobra) return "frente";
  const m = manobra.toLowerCase();
  if (m.includes("uturn")) return "retorno";
  if (m.includes("roundabout")) return "rotatoria";
  if (m.includes("left")) return "esquerda";
  if (m.includes("right")) return "direita";
  return "frente";
}

/** Distância até a manobra. Curta abaixo de 1 km, como se lê pilotando. */
export function distanciaDaManobra(metros: number | null | undefined): string | null {
  if (metros == null || !Number.isFinite(metros) || metros < 0) return null;
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`;
  return `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
}

/**
 * Reduz a instrução ao essencial: o nome da via.
 *
 * "Vire à esquerda na R. da Consolação" vira "R. da Consolação". A seta já
 * diz o movimento; repetir isso em texto rouba tempo de leitura.
 */
export function viaDaInstrucao(instrucao: string | null | undefined): string | null {
  if (!instrucao) return null;
  const limpa = instrucao.replace(/\s+/g, " ").trim();
  if (!limpa) return null;
  const corte = limpa.match(/\b(?:na|no|em|para|até|sentido)\s+(.+)$/i);
  const via = (corte?.[1] ?? limpa).trim();
  return via.length > 42 ? `${via.slice(0, 41).trimEnd()}…` : via;
}
