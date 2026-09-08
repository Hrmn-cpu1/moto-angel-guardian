import { supabase } from "@/integrations/supabase/client";
import { enqueueTrip, flushTripOutbox } from "./trip-outbox";
import { protectionOwner } from "./protection-session";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type TripTable = Database["public"]["Tables"]["trips"];
type TripDatabase = Database & {
  public: {
    Tables: {
      trips: {
        Row: TripTable["Row"] & { distance_measured: boolean };
        Insert: TripTable["Insert"] & { distance_measured?: boolean };
        Update: TripTable["Update"] & { distance_measured?: boolean };
        Relationships: TripTable["Relationships"];
      };
    };
  };
};

let job: Promise<void> | null = null;
let syncRequested = false;
export async function queueCompletedTrip(startedMs: number): Promise<void> {
  // Identity was verified by the authenticated route. Completion works offline.
  enqueueTrip(localStorage, protectionOwner(), startedMs, Date.now(), crypto.randomUUID());
}

export async function syncCompletedTrips(): Promise<void> {
  syncRequested = true;
  if (job) return job;
  job = (async () => {
    while (syncRequested) {
      syncRequested = false;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await flushTripOutbox(localStorage, user.id, async (row) => {
        // A stable primary key and DO NOTHING make retries idempotent.
        const client = supabase as unknown as SupabaseClient<TripDatabase>;
        const { error } = await client
          .from("trips")
          .upsert(row, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
      });
      window.dispatchEvent(new Event("moto-anjo:history-synced"));
    }
  })().finally(() => {
    job = null;
  });
  return job;
}
