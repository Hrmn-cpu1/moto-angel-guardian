/**
 * Bottom sheets da Home — um por vez, e só um.
 *
 * BUG REAL (RC3.2 #4): "Camadas do mapa", "Viagem Segura" e a busca de
 * destino eram três booleanos independentes na Home. Abrir um não fechava o
 * outro, então dois painéis disputavam a mesma faixa inferior com dois fundos
 * escurecidos empilhados. Com o SOS flutuante por cima (ver `layers.ts`), o
 * CTA do painel ficava inalcançável.
 *
 * Aqui o estado é UM só, e as regras são puras e testáveis.
 */

export type Folha = "nenhuma" | "camadas" | "destino" | "viagem" | "avisar" | "avisos";

/** Abrir uma folha fecha qualquer outra. Tocar na mesma folha alterna. */
export function abrirFolha(atual: Folha, alvo: Exclude<Folha, "nenhuma">): Folha {
  return atual === alvo ? "nenhuma" : alvo;
}

export function fecharFolha(): Folha {
  return "nenhuma";
}

export function algumaFolhaAberta(f: Folha): boolean {
  return f !== "nenhuma";
}

/**
 * O SOS flutuante pode aparecer agora?
 *
 * REGRA DE SEGURANÇA: o SOS nunca some da vida do usuário — some apenas do
 * lugar onde estaria por cima de um formulário ou de um CTA. Com uma folha
 * aberta, o acionamento continua a um toque de distância dentro da própria
 * folha (fechar) e na tela /sos; o que não pode é ele interceptar o toque
 * destinado ao campo de destino ou ao botão "Iniciar viagem".
 *
 * Com o teclado virtual aberto vale o mesmo: a região do FAB é exatamente a
 * região que o teclado ocupa.
 */
export function sosFlutuanteVisivel(folha: Folha, tecladoAberto: boolean): boolean {
  return folha === "nenhuma" && !tecladoAberto;
}
