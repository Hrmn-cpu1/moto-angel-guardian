import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import type { User as AppUser } from "@/types";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  bike_model: string;
  plate: string;
  blood_type: string;
  emergency_contact: string;
  emergency_phone: string;
  avatar_url: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  created_at: string;
};

function toAppUser(row: ProfileRow): AppUser {
  return {
    id: row.id,
    name: row.name || row.email.split("@")[0] || "Motociclista",
    email: row.email,
    phone: row.phone,
    bikeModel: row.bike_model,
    plate: row.plate,
    bloodType: row.blood_type,
    emergencyContact: row.emergency_contact,
    emergencyPhone: row.emergency_phone,
    avatar: row.avatar_url ?? undefined,
    createdAt: row.created_at,
    termsAcceptedAt: row.terms_accepted_at ?? undefined,
    termsVersion: row.terms_version ?? undefined,
  };
}

async function loadProfile(userId: string, email: string): Promise<AppUser | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) return toAppUser(data as ProfileRow);
  // Fallback: ensure a profile row exists (in case the trigger didn't run for OAuth users)
  await supabase.from("profiles").upsert({ id: userId, email, name: email.split("@")[0] });
  const { data: row } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return row ? toAppUser(row as ProfileRow) : null;
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session?.user) {
        const u = await loadProfile(data.session.user.id, data.session.user.email ?? "");
        if (mounted) setUser(u);
      }
      if (mounted) setLoading(false);
    };
    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (session?.user) {
        void loadProfile(session.user.id, session.user.email ?? "").then((u) => {
          if (mounted) setUser(u);
        });
      } else {
        if (mounted) setUser(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(mapAuthError(error.message));
    if (!data.user) throw new Error("Falha ao entrar.");
    const u = await loadProfile(data.user.id, data.user.email ?? "");
    if (u) setUser(u);
    return u;
  }, []);

  const register = useCallback(
    async (payload: Omit<AppUser, "id" | "createdAt"> & { password: string }) => {
      const { password, ...rest } = payload;
      const { data, error } = await supabase.auth.signUp({
        email: rest.email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { name: rest.name, phone: rest.phone },
        },
      });
      if (error) throw new Error(mapAuthError(error.message));
      if (!data.user) throw new Error("Falha ao criar conta.");
      // Upsert profile fields (the trigger creates a bare row; we fill the rest here).
      await supabase.from("profiles").upsert({
        id: data.user.id,
        name: rest.name,
        email: rest.email,
        phone: rest.phone,
        bike_model: rest.bikeModel ?? "",
        plate: rest.plate ?? "",
        blood_type: rest.bloodType ?? "",
        emergency_contact: rest.emergencyContact ?? "",
        emergency_phone: rest.emergencyPhone ?? "",
        terms_accepted_at: new Date().toISOString(),
        terms_version: CURRENT_TERMS_VERSION,
      });
      const u = await loadProfile(data.user.id, data.user.email ?? "");
      if (u) setUser(u);
      return u;
    },
    [],
  );

  const loginWithGoogle = useCallback(async (nextPath?: string) => {
    const redirectBase = window.location.origin;
    // Preserve where the user was heading, if provided.
    if (nextPath) {
      try {
        sessionStorage.setItem("moto_anjo_next", nextPath);
      } catch {
        /* ignore */
      }
    }
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirectBase });
    if (result.error) throw new Error(result.error.message || "Falha no login Google.");
    return result;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const updateUser = useCallback(async (patch: Partial<AppUser>) => {
    if (!user) return;
    const dbPatch = {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.phone !== undefined && { phone: patch.phone }),
      ...(patch.bikeModel !== undefined && { bike_model: patch.bikeModel }),
      ...(patch.plate !== undefined && { plate: patch.plate }),
      ...(patch.bloodType !== undefined && { blood_type: patch.bloodType }),
      ...(patch.emergencyContact !== undefined && { emergency_contact: patch.emergencyContact }),
      ...(patch.emergencyPhone !== undefined && { emergency_phone: patch.emergencyPhone }),
      ...(patch.termsAcceptedAt !== undefined && { terms_accepted_at: patch.termsAcceptedAt }),
      ...(patch.termsVersion !== undefined && { terms_version: patch.termsVersion }),
    };
    if (Object.keys(dbPatch).length === 0) return;
    await supabase.from("profiles").update(dbPatch).eq("id", user.id);
    setUser({ ...user, ...patch });
  }, [user]);

  return useMemo(
    () => ({ user, loading, login, register, logout, updateUser, loginWithGoogle }),
    [user, loading, login, register, logout, updateUser, loginWithGoogle],
  );
}

function mapAuthError(msg: string): string {
  const low = msg.toLowerCase();
  if (low.includes("invalid login")) return "E-mail ou senha inválidos.";
  if (low.includes("already registered") || low.includes("user already")) return "Já existe uma conta com este e-mail.";
  if (low.includes("password should be at least")) {
    const m = msg.match(/at least (\d+)/i);
    const n = m ? m[1] : "8";
    return `Senha muito curta (mínimo ${n} caracteres).`;
  }
  if (low.includes("weak password")) return "Senha muito fraca. Use letras, números e símbolos.";
  if (low.includes("password")) return msg;
  return msg;
}
