import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/internal/sos-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { secretEquals } = await import("@/lib/sos-webhook.server");
        const secret = process.env.SOS_DISPATCH_SECRET;
        if (!secret || secret.length < 32) return new Response("unavailable", { status: 503 });
        if (!secretEquals(request.headers.get("authorization"), `Bearer ${secret}`)) {
          return new Response("unauthorized", { status: 401 });
        }
        try {
          const { dispatchDueSosNotifications } = await import("@/lib/sos-dispatch.server");
          return Response.json(await dispatchDueSosNotifications());
        } catch {
          return new Response("dispatch requires reconciliation", { status: 503 });
        }
      },
    },
  },
});
