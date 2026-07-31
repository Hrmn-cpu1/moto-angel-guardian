import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";

export default defineTool({
  name: "list_history",
  title: "List trip and SOS history",
  description: "Return recent trips and SOS events for the signed-in user.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [trips, sos] = await Promise.all([
      sb.from("trips").select("*").order("started_at", { ascending: false }).limit(20),
      sb.from("sos_events").select("*").order("triggered_at", { ascending: false }).limit(20),
    ]);
    return {
      content: [{ type: "text", text: JSON.stringify({ trips: trips.data, sos: sos.data }) }],
      structuredContent: { trips: trips.data, sos: sos.data },
    };
  },
});
