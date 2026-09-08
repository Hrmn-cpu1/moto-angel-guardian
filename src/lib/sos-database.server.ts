import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ClaimedSosNotification {
  id: string;
  sos_event_id: string;
  recipient_phone: string;
  attempts: number;
  rider_name: string;
  rider_phone: string;
  latitude: number;
  longitude: number;
  triggered_at: string;
}

type DurableDatabase = Database & {
  public: {
    Functions: {
      claim_due_sos_notifications: {
        Args: {
          _claim_token: string;
          _sos_event_id?: string;
          _only_failed?: boolean;
          _max?: number;
        };
        Returns: ClaimedSosNotification[];
      };
      settle_sos_dispatch: {
        Args: {
          _id: string;
          _claim_token: string;
          _outcome: "sent" | "failed" | "unknown";
          _provider_message_id?: string;
          _error?: string;
          _retryable?: boolean;
        };
        Returns: boolean;
      };
      receive_sos_delivery: {
        Args: {
          _provider_message_id: string;
          _status: "sent" | "failed" | "delivered" | "read";
          _occurred_at: string;
        };
        Returns: boolean;
      };
    };
  };
};

/** Additive migration types, kept separate from the generated schema snapshot. */
export const sosDatabase = supabaseAdmin as unknown as SupabaseClient<DurableDatabase>;
