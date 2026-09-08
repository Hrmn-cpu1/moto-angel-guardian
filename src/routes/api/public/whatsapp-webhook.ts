import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const { handleWhatsAppWebhook } = await import("@/lib/sos-webhook.server");
  return handleWhatsAppWebhook(request);
}

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: { handlers: { GET: handle, POST: handle } },
});
