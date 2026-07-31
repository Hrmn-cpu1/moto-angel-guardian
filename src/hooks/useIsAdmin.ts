import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Shared, cached role check — previously re-queried on every screen mount.
export function useIsAdmin(userId?: string) {
  const { data, isLoading } = useQuery({
    queryKey: ["is-admin", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .eq("role", "admin");
      if (error) throw error;
      return !!data && data.length > 0;
    },
  });
  return { isAdmin: data ?? false, checking: !!userId && isLoading };
}
