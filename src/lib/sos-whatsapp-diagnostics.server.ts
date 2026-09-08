const errorNames = new Set([
  "Error",
  "TypeError",
  "SyntaxError",
  "TimeoutError",
  "AbortError",
  "AggregateError",
]);
const errorCodes = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
]);

function field(value: unknown, key: string): unknown {
  try {
    return value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)[key]
      : undefined;
  } catch {
    return undefined;
  }
}

/** Canonical labels only: error messages can contain headers, URLs and patient/contact data. */
export function evolutionPreflightDiagnostic(error: unknown) {
  const rawName = field(error, "name");
  const name = typeof rawName === "string" && errorNames.has(rawName) ? rawName : "Error";
  const rawCode = field(field(error, "cause"), "code") ?? field(error, "code");
  const code = typeof rawCode === "string" && errorCodes.has(rawCode) ? rawCode : undefined;
  const rawMessage = field(error, "message");
  const message = typeof rawMessage === "string" ? rawMessage.slice(0, 4096) : "";
  let reason = "network";
  let label = "Network request failed";
  if (
    name === "TimeoutError" ||
    name === "AbortError" ||
    code?.includes("TIMEOUT") ||
    code === "ETIMEDOUT"
  ) {
    reason = "timeout";
    label = "Connection timed out or aborted";
  } else if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    /\bDNS\b|resolve.*(?:host|address)/i.test(message)
  ) {
    reason = "dns";
    label = "DNS resolution failed";
  } else if (
    (code && /CERT|TLS|SSL|ISSUER|SIGNATURE/.test(code)) ||
    /\bTLS\b|\bSSL\b|certificate/i.test(message)
  ) {
    reason = "tls";
    label = "TLS validation or handshake failed";
  } else if (/redirect/i.test(message)) {
    reason = "redirect";
    label = "Redirect refused";
  } else if (name === "SyntaxError") {
    reason = "invalid_response";
    label = "Invalid JSON response";
  } else if (
    /AbortSignal\.timeout.*(?:not a function|not implemented|undefined)|AbortSignal is not defined/i.test(
      message,
    )
  ) {
    reason = "runtime";
    label = "AbortSignal.timeout unavailable";
  } else if (/illegal invocation|invalid receiver/i.test(message)) {
    reason = "runtime";
    label = "Fetch runtime invocation failed";
  } else if (/invalid.*header|header.*invalid|ByteString/i.test(message)) {
    reason = "configuration";
    label = "Invalid request headers";
  }
  return { reason, diagnostic: { name, message: label, ...(code ? { cause: { code } } : {}) } };
}
