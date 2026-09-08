import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/native/sos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleNativeSos } = await import("@/lib/native-protection.server");
        return handleNativeSos(request);
      },
    },
  },
});
