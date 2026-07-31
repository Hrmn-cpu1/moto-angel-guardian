import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ShareGrant {
  id: string;
  viewer_id: string;
  viewer_name: string;
  viewer_avatar: string | null;
  status: "pending" | "approved" | "revoked";
  created_at: string;
}

export const locationSharesKey = ["location-shares"] as const;

/**
 * Explicit, owner-approved authorization list for live location.
 * Nobody sees a rider's position unless that rider approved them here.
 */
export function useLocationShares() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: locationSharesKey,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<ShareGrant[]> => {
      const { data, error } = await supabase.rpc("location_share_inbox");
      if (error) throw error;
      return (data ?? []) as unknown as ShareGrant[];
    },
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: locationSharesKey });
    void qc.invalidateQueries({ queryKey: ["online-riders"] });
  }, [qc]);

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "revoked" }) => {
      const { error } = await supabase.from("location_shares").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const request = useMutation({
    mutationFn: async (phone: string) => {
      const { data, error } = await supabase.rpc("request_location_access", { _phone: phone });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: invalidate,
  });

  const grants = query.data ?? [];

  return {
    grants,
    pending: grants.filter((g) => g.status === "pending"),
    approved: grants.filter((g) => g.status === "approved"),
    loading: query.isLoading,
    error: query.error as Error | null,
    approve: (id: string) => setStatus.mutateAsync({ id, status: "approved" }),
    revoke: (id: string) => setStatus.mutateAsync({ id, status: "revoked" }),
    requestAccess: (phone: string) => request.mutateAsync(phone),
    requesting: request.isPending,
    refresh: invalidate,
  };
}
