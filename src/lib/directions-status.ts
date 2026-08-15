/**
 * Classificação de falha do Directions do Google.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * O mapa tratava toda falha de rota do mesmo jeito: "Rota temporariamente
 * indisponível" + botão "Tentar novamente". Isso é errado em três direções ao
 * mesmo tempo:
 *
 *   . REQUEST_DENIED é problema de configuração da chave no Google Cloud.
 *     Tentar de novo NUNCA resolve — e o botão convida o motociclista a
 *     insistir num erro que só o dono do projeto pode corrigir. Pior: cada
 *     toque é mais uma chamada cobrada que já se sabe que vai falhar.
 *   . ZERO_RESULTS / NOT_FOUND é resposta legítima: não existe rota dirigível
 *     até ali, ou o endereço não foi encontrado. Chamar isso de "temporário"
 *     é mentira, e insistir devolve o mesmo resultado para sempre.
 *   . OVER_QUERY_LIMIT é o único caso em que repetir faz sentido — e é
 *     justamente o caso em que repetir NA HORA piora, porque a cota já
 *     estourou. Precisa de espera.
 *
 * A palavra "temporariamente" só pode aparecer quando for verdade.
 *
 * O que NÃO muda: em nenhum caso se inventa rota, se apaga destino ou se
 * derruba o mapa. Falha de rota continua sendo estado controlado.
 */

export type FalhaDeRota =
  | "negado" // REQUEST_DENIED — configuração; repetir não resolve
  | "sem_rota" // ZERO_RESULTS / NOT_FOUND — resposta definitiva
  | "cota" // OVER_QUERY_LIMIT — repetir só depois de esperar
  | "invalido" // INVALID_REQUEST / MAX_*_EXCEEDED — pedido malformado
  | "temporario"; // UNKNOWN_ERROR, rede, timeout — repetir agora é razoável

export interface DiagnosticoDeRota {
  falha: FalhaDeRota;
  /** Frase curta para o motociclista. Sem jargão do Google. */
  mensagem: string;
  /** Oferecer "tentar novamente"? Só quando repetir pode mudar o resultado. */
  podeTentarDeNovo: boolean;
  /** Segundos a esperar antes de deixar tentar. 0 = imediato. */
  esperaS: number;
}

/**
 * Extrai o status do erro do Directions.
 *
 * O SDK do Google entrega o status de formas diferentes conforme a versão e o
 * caminho da falha: `error.code`, `error.status`, ou só embutido na mensagem.
 * Nenhum deles é garantido — por isso os três são inspecionados, e qualquer
 * coisa desconhecida cai em "temporário", que é o comportamento antigo e
 * seguro.
 */
export function statusDaFalha(erro: unknown): string | null {
  if (!erro) return null;
  if (typeof erro === "string") return normalizar(erro);

  const e = erro as { code?: unknown; status?: unknown; message?: unknown };
  for (const bruto of [e.code, e.status]) {
    if (typeof bruto === "string" && bruto.trim()) return normalizar(bruto);
  }
  if (typeof e.message === "string") {
    const achado = CONHECIDOS.find((s) => e.message!.toString().toUpperCase().includes(s));
    if (achado) return achado;
  }
  return null;
}

const CONHECIDOS = [
  "REQUEST_DENIED",
  "ZERO_RESULTS",
  "NOT_FOUND",
  "OVER_QUERY_LIMIT",
  "MAX_WAYPOINTS_EXCEEDED",
  "MAX_ROUTE_LENGTH_EXCEEDED",
  "INVALID_REQUEST",
  "UNKNOWN_ERROR",
] as const;

function normalizar(v: string): string {
  return v.trim().toUpperCase();
}

/** Espera antes de liberar nova tentativa quando a cota estoura. */
export const ESPERA_COTA_S = 30;

export function diagnosticarRota(erro: unknown): DiagnosticoDeRota {
  switch (statusDaFalha(erro)) {
    case "REQUEST_DENIED":
      return {
        falha: "negado",
        // Não expõe chave, projeto nem detalhe de configuração — e não pede
        // ao motociclista que resolva algo que não está no aparelho dele.
        mensagem: "Rota indisponível neste app. Seu destino continua salvo.",
        podeTentarDeNovo: false,
        esperaS: 0,
      };
    case "ZERO_RESULTS":
    case "NOT_FOUND":
      return {
        falha: "sem_rota",
        mensagem: "Não há rota de moto até esse ponto. Escolha outro destino.",
        podeTentarDeNovo: false,
        esperaS: 0,
      };
    case "OVER_QUERY_LIMIT":
      return {
        falha: "cota",
        mensagem: "Muitas rotas em pouco tempo. Aguarde alguns segundos.",
        podeTentarDeNovo: true,
        esperaS: ESPERA_COTA_S,
      };
    case "INVALID_REQUEST":
    case "MAX_WAYPOINTS_EXCEEDED":
    case "MAX_ROUTE_LENGTH_EXCEEDED":
      return {
        falha: "invalido",
        mensagem: "Não consegui montar essa rota. Escolha o destino de novo.",
        podeTentarDeNovo: false,
        esperaS: 0,
      };
    default:
      // Rede caída, timeout, UNKNOWN_ERROR do Google, exception síncrona.
      // Aqui "temporariamente" é verdade e repetir é legítimo.
      return {
        falha: "temporario",
        mensagem: "Rota temporariamente indisponível. Seu destino continua salvo.",
        podeTentarDeNovo: true,
        esperaS: 0,
      };
  }
}
