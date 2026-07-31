import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export default defineTool({
  name: "add_contact",
  title: "Add emergency contact",
  description: "Add an emergency contact for the signed-in user.",
  inputSchema: {
    name: z.string().min(1),
    phone: z.string().min(1),
    relation: z.string().default("Contato"),
    is_primary: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb
      .from("emergency_contacts")
      .insert({
        user_id: ctx.getUserId(),
        name: input.name,
        phone: input.phone,
        relation: input.relation,
        is_primary: input.is_primary,
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Contato ${input.name} adicionado.` }],
      structuredContent: { contact: data },
    };
  },
});
