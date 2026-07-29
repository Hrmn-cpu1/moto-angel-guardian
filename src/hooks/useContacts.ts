import { useCallback, useEffect, useState } from "react";
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

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("emergency_contacts")
      .select("*")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    setContacts(((data ?? []) as Row[]).map(toContact));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(
    async (c: Omit<Contact, "id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("emergency_contacts").insert({
        user_id: user.id,
        name: c.name,
        phone: c.phone,
        relation: c.relation,
        is_primary: c.isPrimary,
      });
      await reload();
    },
    [reload],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Contact>) => {
      const dbPatch: Record<string, unknown> = {};
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.phone !== undefined) dbPatch.phone = patch.phone;
      if (patch.relation !== undefined) dbPatch.relation = patch.relation;
      if (patch.isPrimary !== undefined) dbPatch.is_primary = patch.isPrimary;
      await supabase.from("emergency_contacts").update(dbPatch).eq("id", id);
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await supabase.from("emergency_contacts").delete().eq("id", id);
      await reload();
    },
    [reload],
  );

  const setPrimary = useCallback(
    async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("emergency_contacts").update({ is_primary: false }).eq("user_id", user.id);
      await supabase.from("emergency_contacts").update({ is_primary: true }).eq("id", id);
      await reload();
    },
    [reload],
  );

  return { contacts, add, update, remove, setPrimary };
}
