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
      // Validação no backend: has_role exige o e-mail administrador fixo.
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId!,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });
  return { isAdmin: data ?? false, checking: !!userId && isLoading };
}
