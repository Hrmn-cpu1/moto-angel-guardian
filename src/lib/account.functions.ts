import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ confirmation: z.literal("DELETE") });

/**
 * Exclusão definitiva iniciada pelo próprio usuário.
 * A limpeza pública acontece em uma RPC SECURITY DEFINER vinculada a auth.uid().
 * A remoção de auth.users usa service_role exclusivamente no servidor.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ context }) => {
    const { userId, supabase } = context;

    const { error: cleanupError } = await supabase.rpc("prepare_my_account_deletion");
    if (cleanupError) {
      console.error("[account] limpeza antes da exclusão falhou", cleanupError);
      throw new Error("Não foi possível preparar a exclusão da conta. Nada foi apagado.");
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId, false);
      if (error) throw error;
    } catch (error) {
      console.error("[account] auth.admin.deleteUser falhou", error);
      throw new Error("Os dados foram preparados, mas a conta de autenticação não pôde ser encerrada. Tente novamente.");
    }

    return { deleted: true };
  });
