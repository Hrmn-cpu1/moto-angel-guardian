/** Server-only provider selection. Unknown names never fall back to another account. */
export function whatsappProvider(): "meta" | "evolution" | null {
  const value = process.env.SOS_DELIVERY_PROVIDER ?? "meta";
  return value === "meta" || value === "evolution" ? value : null;
}

/** Only events created after this explicit activation may be sent automatically. */
export function deliveryNotBefore(): number | null {
  const value = process.env.SOS_DELIVERY_NOT_BEFORE;
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function eventAllowedForAutoDelivery(triggeredAt: string | Date): boolean {
  const cutoff = deliveryNotBefore();
  if (whatsappProvider() === "evolution" && cutoff === null) return false;
  if (process.env.SOS_DELIVERY_NOT_BEFORE && cutoff === null) return false;
  const timestamp = new Date(triggeredAt).getTime();
  return Number.isFinite(timestamp) && (cutoff === null || timestamp >= cutoff);
}

export function evolutionConfiguration(): {
  baseUrl: string;
  instance: string;
  apiKey: string;
} | null {
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!apiKey || /[\r\n]/.test(apiKey) || !instance || !/^[A-Za-z0-9_-]{1,100}$/.test(instance))
    return null;
  try {
    const url = new URL(process.env.EVOLUTION_API_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      return null;
    return { baseUrl: url.toString().replace(/\/+$/, ""), instance, apiKey };
  } catch {
    return null;
  }
}
