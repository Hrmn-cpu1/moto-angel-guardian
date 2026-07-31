import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Contact } from "@/types";

type Row = {
  id: string;
  name: string;
  phone: string;
  relation: string;
  is_primary: boolean;
};

const toContact = (r: Row): Contact => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  relation: r.relation,
  isPrimary: r.is_primary,
});

export const contactsKey = ["contacts"] as const;

async function fetchContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from("emergency_contacts")
    .select("id,name,phone,relation,is_primary")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toContact);
}

export function useContacts() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: contactsKey,
    queryFn: fetchContacts,
    staleTime: 60_000,
    retry: 2,
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: contactsKey });
  }, [qc]);

  // Realtime keeps the cache fresh across devices without polling.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      channel = supabase
        .channel(`emergency_contacts:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "emergency_contacts",
            filter: `user_id=eq.${user.id}`,
          },
          invalidate,
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [invalidate]);

  const addMutation = useMutation({
    mutationFn: async (c: Omit<Contact, "id">) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("emergency_contacts").insert({
        user_id: user.id,
        name: c.name,
        phone: c.phone,
        relation: c.relation,
        is_primary: c.isPrimary,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Contact> }) => {
      const dbPatch = {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.phone !== undefined && { phone: patch.phone }),
        ...(patch.relation !== undefined && { relation: patch.relation }),
        ...(patch.isPrimary !== undefined && { is_primary: patch.isPrimary }),
      };
      const { error } = await supabase.from("emergency_contacts").update(dbPatch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emergency_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("emergency_contacts")
        .update({ is_primary: false })
        .eq("user_id", user.id);
      const { error } = await supabase
        .from("emergency_contacts")
        .update({ is_primary: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const add = useCallback((c: Omit<Contact, "id">) => addMutation.mutateAsync(c), [addMutation]);
  const update = useCallback(
    (id: string, patch: Partial<Contact>) => updateMutation.mutateAsync({ id, patch }),
    [updateMutation],
  );
  const remove = useCallback((id: string) => removeMutation.mutateAsync(id), [removeMutation]);
  const setPrimary = useCallback(
    (id: string) => setPrimaryMutation.mutateAsync(id),
    [setPrimaryMutation],
  );

  return { contacts: data ?? [], loading: isLoading, add, update, remove, setPrimary, invalidate };
}
