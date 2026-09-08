import { createClient } from "@supabase/supabase-js";

/** Validate both tokens against Auth; never mutate the shared admin session. */
export async function validateNativeSession(accessToken: string, refreshToken: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Login nativo indisponível.");
  const auth = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }).auth;
  const { data: original, error: accessError } = await auth.getUser(accessToken);
  if (accessError || !original.user) throw new Error("Sessão de login inválida.");
  // Refresh validates ownership and rotates the token. Stash the returned pair.
  const { data: refreshed, error: refreshError } = await auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (refreshError || !refreshed.session || refreshed.user?.id !== original.user.id) {
    throw new Error("Sessão de login inválida.");
  }
  return refreshed.session;
}
