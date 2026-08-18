import { createFileRoute } from "@tanstack/react-router";

type PublicBuildConfig = {
  supabaseUrlPresent: boolean;
  supabaseKeyPresent: boolean;
  projectIdPresent: boolean;
  buildId: string;
  commitSha: string | null;
};

function readPublicBuildConfig(): PublicBuildConfig {
  const env = import.meta.env;
  const scripts =
    typeof document === "undefined"
      ? []
      : Array.from(document.scripts)
          .map((script) => script.src)
          .filter(Boolean);
  const asset = scripts.find((src) => src.includes("/assets/"));

  return {
    supabaseUrlPresent: Boolean(env.VITE_SUPABASE_URL),
    supabaseKeyPresent: Boolean(env.VITE_SUPABASE_PUBLISHABLE_KEY),
    projectIdPresent: Boolean(env.VITE_SUPABASE_PROJECT_ID),
    buildId: asset?.split("/").pop() ?? "unavailable",
    commitSha: env.VITE_COMMIT_SHA ?? env.VITE_GIT_COMMIT_SHA ?? null,
  };
}

function ConfigDebugPage() {
  const config = readPublicBuildConfig();

  return (
    <main className="min-h-[100dvh] bg-background px-5 py-8 text-foreground">
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-semibold">Diagnóstico da configuração pública</h1>
        <pre className="mt-5 overflow-x-auto rounded-md border border-border bg-card p-4 text-sm">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/config-debug")({
  head: () => ({
    meta: [
      { title: "Diagnóstico de configuração — Moto Anjo" },
      {
        name: "description",
        content: "Verificação segura da presença da configuração pública do Moto Anjo.",
      },
      { property: "og:title", content: "Diagnóstico de configuração — Moto Anjo" },
      {
        property: "og:description",
        content: "Verificação segura da presença da configuração pública do Moto Anjo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfigDebugPage,
});