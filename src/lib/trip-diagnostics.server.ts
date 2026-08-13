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
  timestamp: z.string().datetime(),
});

export type TripDiagnosticPayload = z.infer<typeof tripDiagnosticSchema>;

export function logTripDiagnostic(payload: TripDiagnosticPayload, userId: string): void {
  console.error("[MA-TRIP-001]", JSON.stringify({ ...payload, userId }));
}