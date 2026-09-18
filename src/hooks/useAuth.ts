import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import type { User as AppUser } from "@/types";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";
import { classifyAuthError, authFailure } from "@/lib/auth-errors";
import { isNativeApp } from "@/lib/native";
import { stopNativeProtection } from "@/lib/native-protection";
import { finalizarViagemAtual, resetTripRuntime } from "@/hooks/useTrip";
import { salvarViagem, VIAGEM_INICIAL } from "@/lib/trip";
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
  referral_code?: string | null;
  referred_by?: string | null;
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
    referralCode: row.referral_code ?? undefined,
    referredBy: row.referred_by ?? undefined,
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
      // An external sign-out must not leave GPS or a previous owner's trip running.
      resetTripRuntime();
      salvarViagem(VIAGEM_INICIAL);
      void stopNativeProtection().catch(() => undefined);
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
    async (payload: Omit<AppUser, "id" | "createdAt" | "referralCode" | "referredBy"> & { password: string; referralCode?: string }) => {
      assertPublicAuthConfig();
      const { password, ...rest } = payload;
      const termsAcceptedAt = new Date().toISOString();
      const { data, error } = await supabase.auth.signUp({
        email: rest.email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            name: rest.name.trim(),
            phone: rest.phone.trim(),
            bike_model: (rest.bikeModel ?? "").trim(),
            plate: (rest.plate ?? "").trim().toUpperCase(),
            blood_type: (rest.bloodType ?? "").trim(),
            emergency_contact: (rest.emergencyContact ?? "").trim(),
            emergency_phone: (rest.emergencyPhone ?? "").trim(),
            terms_accepted_at: termsAcceptedAt,
            terms_version: CURRENT_TERMS_VERSION,
            referral_code: rest.referralCode?.trim().toUpperCase() || null,
          },
        },
      });
      if (error) throw classifyAuthError(error);
      if (!data.user) throw authFailure("unexpected", "Falha ao criar conta.");
      // O Supabase responde 200 mesmo quando o e-mail já existe (proteção
      // contra enumeração): a marca é `identities` vazio.
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw authFailure("already_registered");
      }
      // Confirmação de e-mail está ativa: não há sessão até o usuário clicar
      // no link. Não fingimos login — a tela mostra o aviso.
      if (!data.session) {
        return { status: "confirm_email" as const, user: null };
      }
      // Upsert profile fields (the trigger creates a bare row; we fill the rest here).
      await supabase.from("profiles").upsert({
        id: data.user.id,
        name: rest.name.trim(),
        email: rest.email.trim(),
        phone: rest.phone.trim(),
        bike_model: (rest.bikeModel ?? "").trim(),
        plate: (rest.plate ?? "").trim().toUpperCase(),
        blood_type: (rest.bloodType ?? "").trim(),
        emergency_contact: (rest.emergencyContact ?? "").trim(),
        emergency_phone: (rest.emergencyPhone ?? "").trim(),
        terms_accepted_at: termsAcceptedAt,
        terms_version: CURRENT_TERMS_VERSION,
      });
      // Se houver contato de emergência, registrar também em emergency_contacts
      if (rest.emergencyContact?.trim() && rest.emergencyPhone?.trim()) {
        try {
          const { count } = await supabase
            .from("emergency_contacts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", data.user.id);
          if ((count ?? 0) === 0) {
            await supabase.from("emergency_contacts").insert({
              user_id: data.user.id,
              name: rest.emergencyContact.trim(),
              phone: rest.emergencyPhone.trim(),
              relation: "Contato de emergência",
              is_primary: true,
            });
          }
        } catch {
          /* Fallback silencioso; o perfil já salvou o contato */
        }
      }
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
    if (!(await finalizarViagemAtual()))
      throw new Error("Confira o SOS pendente e finalize a viagem antes de sair.");
    await stopNativeProtection({ preservePending: true });
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error("Não foi possível sair da conta. Tente novamente.");
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
