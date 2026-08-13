import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logTripDiagnostic, tripDiagnosticSchema } from "./trip-diagnostics.server";

export const reportTripDiagnostic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => tripDiagnosticSchema.parse(input))
  .handler(async ({ data, context }) => {
    logTripDiagnostic(data, context.userId);
    return { accepted: true };
  });