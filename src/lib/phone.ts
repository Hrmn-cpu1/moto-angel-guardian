// Normalize BR-ish phone numbers to E.164 digits (no +) for wa.me links.
export function normalizePhone(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  // Already has country code (>=12 digits e.g. 5511999999999)
  if (digits.length >= 12) return digits;
  // Assume Brazil if 10 or 11 digits (with DDD)
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function waLink(phone: string, message: string): string {
  const n = normalizePhone(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}