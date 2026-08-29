import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { loadEnv, type Plugin } from "vite";

function canonicalSupabasePublicEnv(): Plugin {
  return {
    name: "moto-anjo:canonical-supabase-public-env",
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), "");
      const url = process.env.SUPABASE_URL ?? env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
      const publishableKey =
        process.env.SUPABASE_PUBLISHABLE_KEY ??
        env.SUPABASE_PUBLISHABLE_KEY ??
        env.VITE_SUPABASE_PUBLISHABLE_KEY;

      return {
        define: {
          ...(url ? { "process.env.SUPABASE_URL": JSON.stringify(url) } : {}),
          ...(publishableKey
            ? { "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publishableKey) }
            : {}),
        },
      };
    },
  };
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [canonicalSupabasePublicEnv(), mcpPlugin()],
  },
});
