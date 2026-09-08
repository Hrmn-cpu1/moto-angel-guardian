import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createNativeProtectionSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ deviceSessionId: z.string().uuid(), tripStartedAt: z.number().int().positive() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { createProtectionSession } = await import("./native-protection.server");
    return createProtectionSession(context.userId, data);
  });

export const revokeNativeProtectionSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { revokeProtectionSession } = await import("./native-protection.server");
    return revokeProtectionSession(context.userId, data.sessionId);
  });

export const cancelNativeProtectionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sessionId: z.string().uuid(), requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { cancelProtectionRequest } = await import("./native-protection.server");
    return cancelProtectionRequest(context.userId, data);
  });
