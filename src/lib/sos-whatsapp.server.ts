import { sendSosTemplate, type SosTemplateData } from "./sos.server.ts";
import { sendSosEvolution } from "./sos-whatsapp-evolution.server.ts";
import { whatsappProvider } from "./sos-whatsapp-config.server.ts";

export function sendSosWhatsApp(
  recipientPhone: string,
  data: SosTemplateData,
  fetcher: typeof fetch = fetch,
  confirmMaySend?: () => Promise<boolean>,
) {
  return whatsappProvider() === "evolution"
    ? sendSosEvolution(recipientPhone, data, fetcher, confirmMaySend)
    : sendSosTemplate(recipientPhone, data, fetcher);
}
