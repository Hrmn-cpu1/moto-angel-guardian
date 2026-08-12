/**
 * Presença do próprio usuário (RC2 hotfix P0.5-A).
 *
 * As RPCs de proximidade deixaram de aceitar um centro inventado pelo cliente:
 * elas usam a posição recente do viewer gravada em `live_locations`. Este
 * módulo é quem registra essa posição, chamando `presence_touch`.
 *
 * O que `presence_touch` faz e o que NÃO faz:
 *   . escreve só a linha do próprio usuário;
 *   . preserva `sharing` como está — atualizar posição nunca muda a escolha
 *     de compartilhamento, em nenhuma direção;
 *   . cria a primeira linha com `sharing = false`.
 *
 * Ou seja: registrar presença para PODER VER alertas próximos não faz ninguém
 * APARECER para os outros. São duas coisas diferentes e continuam separadas.
 *
 * SOBRE O THROTTLE DAQUI (P0.6-B): o intervalo abaixo é UX e economia de
 * chamada — nada mais. Ele mora no aparelho e some se alguém falar direto com
 * a API. Os controles que valem são os do servidor: intervalo mínimo de 5 s e
 * recusa de deslocamento implausível dentro de `presence_touch`.
 */

/** Evita repetir a mesma chamada a cada render de cada tela. */
let ultimoEnvio = 0;
const INTERVALO_MINIMO_MS = 20_000;

export function _resetarPresenca(): void {
  ultimoEnvio = 0;
}

/** Deve enviar agora? Pura, para o teste não depender de relógio real. */
export function devePublicarPresenca(
  agora: number,
  ultimo: number,
  intervaloMs: number = INTERVALO_MINIMO_MS,
): boolean {
  return agora - ultimo >= intervaloMs;
}

/** O que o servidor respondeu à última tentativa de gravar presença. */
export type StatusPresenca = "ok" | "created" | "throttled" | "rejected_jump" | "desconhecido";

export interface ResultadoPresenca {
  status: StatusPresenca;
  erro: string | null;
}

/**
 * Envia a posição para `presence_touch`. Sem throttle local — quem chama
 * decide. Usado pelo compartilhamento contínuo, que já tem o próprio ritmo.
 */
export async function publicarPresenca(pos: {
  lat: number;
  lng: number;
  speedKmh?: number | null;
  heading?: number | null;
}): Promise<ResultadoPresenca> {
  try {
    // Import dinâmico: mantém este módulo carregável fora do navegador, então
    // a regra de frequência acima é testável sem puxar o cliente Supabase.
    const { dbNovo } = await import("./db-novo.ts");
    const { data, error } = await dbNovo().rpc("presence_touch", {
      _lat: pos.lat,
      _lng: pos.lng,
      _speed_kmh: pos.speedKmh ?? null,
      _heading: pos.heading ?? null,
    });
    if (error) return { status: "desconhecido", erro: error.message };
    return { status: interpretarStatus(data), erro: null };
  } catch (e) {
    return { status: "desconhecido", erro: e instanceof Error ? e.message : "Falha ao enviar posição." };
  }
}

/** A RPC devolve texto; qualquer outra coisa vira "desconhecido". */
export function interpretarStatus(bruto: unknown): StatusPresenca {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  const texto = typeof valor === "string" ? valor : String(valor ?? "");
  return ["ok", "created", "throttled", "rejected_jump"].includes(texto)
    ? (texto as StatusPresenca)
    : "desconhecido";
}

/** Registro de presença das telas de consulta, com throttle de UX. */
export async function registrarPresenca(pos: { lat: number; lng: number }): Promise<void> {
  const agora = Date.now();
  if (!devePublicarPresenca(agora, ultimoEnvio)) return;
  ultimoEnvio = agora;
  const r = await publicarPresenca(pos);
  if (r.erro) {
    // Presença é melhor-esforço: falhar aqui não pode derrubar a tela. A
    // consequência de não registrar é a lista de proximidade vir vazia, que
    // é o lado seguro.
    ultimoEnvio = 0;
  }
}
