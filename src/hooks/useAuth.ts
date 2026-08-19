import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import type { User as AppUser } from "@/types";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";
import { classifyAuthError, authFailure } from "@/lib/auth-errors";
import { isNativeApp } from "@/lib/native";
import { nextInternoOuIndefinido } from "@/lib/redirect-seguro";
import {
  getNativeAuthSnapshot,
  signInWithGoogleNative,
  subscribeNativeAuth,
} from "@/lib/native-auth";

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

// Single shared auth store: one session bootstrap and one auth listener for the
// whole app, instead of one per mounted component.
type AuthState = { user: AppUser | null; loading: boolean };

const SERVER_STATE: AuthState = { user: null, loading: true };
let state: AuthState = SERVER_STATE;
const listeners = new Set<() => void>();
let started = false;

function assertPublicAuthConfig(): void {
  const env = import.meta.env;
  if (
    !env.VITE_SUPABASE_URL ||
    !env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    !env.VITE_SUPABASE_PROJECT_ID
  ) {
    throw authFailure("config");
  }
}

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function startAuthStore() {
  if (started || typeof window === "undefined") return;
  started = true;

  void (async () => {
    try {
      assertPublicAuthConfig();
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;
      const u = sessionUser ? await loadProfile(sessionUser.id, sessionUser.email ?? "") : null;
      setState({ user: u, loading: false });
    } catch (error) {
      console.error(
        "[Auth] inicialização indisponível",
        error instanceof Error ? error.name : "unknown",
      );
      setState({ user: null, loading: false });
    }
  })();

  try {
    assertPublicAuthConfig();
  } catch {
    return;
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
    if (session?.user) {
      void loadProfile(session.user.id, session.user.email ?? "").then((u) =>
        setState({ user: u, loading: false }),
      );
    } else {
      setState({ user: null, loading: false });
    }
  });
}

export function useAuth() {
  const { user, loading } = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
  const { processing: nativeAuthProcessing } = useSyncExternalStore(
    subscribeNativeAuth,
    getNativeAuthSnapshot,
    getNativeAuthSnapshot,
  );

  useEffect(() => {
    startAuthStore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    assertPublicAuthConfig();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw classifyAuthError(error);
    if (!data.user) throw authFailure("unexpected", "Falha ao entrar.");
    const u = await loadProfile(data.user.id, data.user.email ?? "");
    setState({ user: u, loading: false });
    return u;
  }, []);

  const register = useCallback(
    async (payload: Omit<AppUser, "id" | "createdAt"> & { password: string }) => {
      assertPublicAuthConfig();
      const { password, ...rest } = payload;
      const { data, error } = await supabase.auth.signUp({
        email: rest.email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { name: rest.name, phone: rest.phone },
        },
      });
      if (error) throw classifyAuthError(error);
      if (!data.user) throw authFailure("unexpected", "Falha ao criar conta.");
      // O Supabase responde 200 mesmo quando o e-mail já existe (proteção
      // contra enumeração): a marca é `identities` vazio. Sem isto o app dizia
      // "conta criada" e em seguida o login falhava com "senha inválida".
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw authFailure("google_only_account");
      }
      // Confirmação de e-mail está ativa: não há sessão até o usuário clicar
      // no link. Não fingimos login — a tela mostra o aviso.
      if (!data.session) {
        return { status: "confirm_email" as const, user: null };
      }
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
      setState({ user: u, loading: false });
      return { status: "signed_in" as const, user: u };
    },
    [],
  );

  const loginWithGoogle = useCallback(async (nextPath?: string) => {
    assertPublicAuthConfig();
    const redirectBase = window.location.origin;
    // Preserve where the user was heading, if provided.
    const destino = nextInternoOuIndefinido(nextPath);
    if (destino) {
      try {
        sessionStorage.setItem("moto_anjo_next", destino);
      } catch {
        /* ignore */
      }
    }
    // Android: Custom Tab + deep link. O WebView puro perdia o fluxo para o
    // Chrome e o Google devolvia 400.
    if (isNativeApp()) {
      await signInWithGoogleNative();
      return { redirected: false as const, error: null };
    }
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirectBase });
    if (result.error) throw classifyAuthError(result.error);
    return result;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ user: null, loading: false });
  }, []);

  const updateUser = useCallback(
    async (patch: Partial<AppUser>) => {
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
      const { error } = await supabase.from("profiles").update(dbPatch).eq("id", user.id);
      if (error) throw new Error("Não foi possível salvar suas alterações.");
      setState({ user: { ...user, ...patch } });
    },
    [user],
  );

  return useMemo(
    () => ({
      user,
      loading: loading || nativeAuthProcessing,
      nativeAuthProcessing,
      login,
      register,
      logout,
      updateUser,
      loginWithGoogle,
    }),
    [user, loading, nativeAuthProcessing, login, register, logout, updateUser, loginWithGoogle],
  );
}

export async function resendConfirmationEmail(email: string): Promise<void> {
  assertPublicAuthConfig();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw classifyAuthError(error);
}
