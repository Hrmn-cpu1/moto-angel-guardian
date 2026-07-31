import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export default defineTool({
  name: "remove_contact",
  title: "Remove emergency contact",
  description: "Remove an emergency contact of the signed-in user by its id.",
  inputSchema: {
    id: z.string().uuid().describe("UUID of the emergency contact to remove."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb
      .from("emergency_contacts")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.getUserId())
      .select()
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data)
      return {
        content: [{ type: "text", text: "Contato não encontrado ou já removido." }],
        structuredContent: { removed: false, id },
      };
    return {
      content: [{ type: "text", text: `Contato ${data.name} removido.` }],
      structuredContent: { removed: true, contact: data },
    };
  },
});
