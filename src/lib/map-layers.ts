/**
 * Camadas do mapa — preferências do usuário (RC2 hotfix P0.4-C).
 *
 * "Aparecer para outros motoqueiros" e "Ver outros motoqueiros" são dois
 * controles diferentes e não podem ser confundidos:
 *
 *   aparecer -> profiles.share_with_riders, no servidor, é sobre a SUA
 *               privacidade;
 *   ver      -> esta preferência, no aparelho, é sobre o que o mapa desenha.
 *
 * A decisão é pura e testável aqui; a persistência recebe o storage por
 * parâmetro, para o teste rodar sem navegador.
 */

export interface CamadasDoMapa {
  /** Camada comunitária: motociclistas desconhecidos que deram opt-in. */
  comunidade: boolean;
  /** Contatos que autorizaram você a acompanhá-los. */
  contatos: boolean;
}

/**
 * Padrão de fábrica: comunidade DESLIGADA.
 *
 * Ligar sozinho seria decidir pelo usuário que ele quer ver desconhecidos no
 * mapa e gastar consulta e bateria com isso. Contatos autorizados começam
 * ligados porque são uma relação que ele já aprovou um a um.
 */
export const CAMADAS_PADRAO: CamadasDoMapa = { comunidade: false, contatos: true };

export const CHAVE_CAMADAS = "moto-anjo:camadas-mapa";

/** Storage mínimo — `localStorage` cabe aqui, e um objeto falso no teste também. */
export interface ArmazenamentoSimples {
  getItem: (chave: string) => string | null;
  setItem: (chave: string, valor: string) => void;
}

function armazenamentoDoNavegador(): ArmazenamentoSimples | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Modo privado ou storage bloqueado: a preferência vira estado de sessão.
    return null;
  }
}

export function carregarCamadas(store: ArmazenamentoSimples | null = armazenamentoDoNavegador()): CamadasDoMapa {
  if (!store) return { ...CAMADAS_PADRAO };
  try {
    const cru = store.getItem(CHAVE_CAMADAS);
    if (!cru) return { ...CAMADAS_PADRAO };
    const lido = JSON.parse(cru) as Partial<CamadasDoMapa>;
    return {
      comunidade: typeof lido.comunidade === "boolean" ? lido.comunidade : CAMADAS_PADRAO.comunidade,
      contatos: typeof lido.contatos === "boolean" ? lido.contatos : CAMADAS_PADRAO.contatos,
    };
  } catch {
    // Valor corrompido não pode derrubar o mapa.
    return { ...CAMADAS_PADRAO };
  }
}

export function salvarCamadas(
  camadas: CamadasDoMapa,
  store: ArmazenamentoSimples | null = armazenamentoDoNavegador(),
): void {
  if (!store) return;
  try {
    store.setItem(CHAVE_CAMADAS, JSON.stringify(camadas));
  } catch {
    /* sem persistência: a preferência vale para esta sessão */
  }
}

/**
 * Quais consultas podem rodar.
 *
 * Camada desligada não é filtro de exibição: a consulta nem sai. Ninguém
 * busca posição de gente que o usuário decidiu não ver.
 */
export function consultasHabilitadas(
  camadas: CamadasDoMapa,
  temPosicao: boolean,
): { comunidade: boolean; contatos: boolean } {
  return {
    comunidade: temPosicao && camadas.comunidade,
    contatos: temPosicao && camadas.contatos,
  };
}

/** Rótulo do canto do mapa. Contato e comunidade são coisas diferentes. */
export function rotuloDeRiders(
  camadas: CamadasDoMapa,
  qtdContatos: number,
  qtdComunidade: number,
): string | null {
  const partes: string[] = [];
  if (camadas.contatos && qtdContatos > 0) {
    partes.push(`${qtdContatos} contato${qtdContatos === 1 ? "" : "s"}`);
  }
  if (camadas.comunidade && qtdComunidade > 0) {
    partes.push(`${qtdComunidade} na comunidade`);
  }
  return partes.length ? partes.join(" · ") : null;
}
