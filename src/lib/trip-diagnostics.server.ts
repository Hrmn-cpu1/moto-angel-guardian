import { z } from "zod";

export const tripDiagnosticSchema = z.object({
  code: z.literal("MA-TRIP-001"),
  source: z.string().max(80),
  name: z.string().max(80),
  message: z.string().max(500),
  stack: z.string().max(2500).optional(),
  pathname: z.string().max(160),
  action: z.string().max(80),
  tripActive: z.boolean(),
  destinationExists: z.boolean(),
  /** Trilha MA-TRIP compacta: marcos do fluxo antes do erro. Sem dado pessoal. */
  trail: z.string().max(900).optional(),
  /** Trilha herdada de uma sessão anterior que terminou de forma anormal. */
  previousTrail: z.string().max(400).optional(),
  /** Só booleanos: presença da configuração pública exigida pelo cliente. */
  config: z.object({ supabaseUrl: z.boolean(), supabaseKey: z.boolean() }).optional(),
  /** Executando dentro do APK. */
  native: z.boolean().optional(),
  /** Marcos MA-AUTH: identifica erro originado no caminho de login. */
  authTrail: z.string().max(900).optional(),
  timestamp: z.string().datetime(),
});

export type TripDiagnosticPayload = z.infer<typeof tripDiagnosticSchema>;

export function logTripDiagnostic(payload: TripDiagnosticPayload, userId: string): void {
  console.error("[MA-TRIP-001]", JSON.stringify({ ...payload, userId }));
}