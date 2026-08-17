/**
 * Prova server-side de que o callback do Moto Anjo foi realmente atingido.
 *
 * O diagnóstico MA-AUTH vive no aparelho; se o Custom Tab nunca voltar, não
 * temos como saber se a página /auth/callback chegou a executar. Este beacon
 * é a única evidência que sobrevive fora do aparelho.
 *
 * Público de propósito: o callback OAuth acontece ANTES de existir sessão.
 * Por isso o contrato é fechado: apenas metadados booleanos e códigos curtos,
 * nunca token, code, verifier, challenge, state, e-mail ou JWT.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BeaconSchema = z.object({
  attempt_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  stage: z.enum(["callback.web.enter", "callback.native.detected", "deepLink.begin"]),
  native_flow: z.boolean(),
  has_state: z.boolean(),
  has_code: z.boolean(),
  has_error: z.boolean(),
  has_session_params: z.boolean(),
  error_code: z.string().max(60).optional(),
  origin_host: z.string().max(120).optional(),
  pathname: z.string().max(120).optional(),
});

export const Route = createFileRoute("/api/public/auth-beacon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const lido = BeaconSchema.safeParse(payload);
        if (!lido.success) return new Response("bad payload", { status: 400 });
        console.info(
          "[MA-AUTH-BEACON]",
          JSON.stringify({ ...lido.data, at: new Date().toISOString() }),
        );
        return new Response(null, { status: 204 });
      },
    },
  },
});
