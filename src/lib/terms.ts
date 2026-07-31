/**
 * Central source of truth for the current Terms of Use version.
 * Bump this string whenever the legal text changes to force every user
 * to re-accept before continuing to use the app.
 */
export const CURRENT_TERMS_VERSION = "2026-07-29";

export function isTermsAccepted(user: {
  termsAcceptedAt?: string;
  termsVersion?: string;
}): boolean {
  return Boolean(user.termsAcceptedAt) && user.termsVersion === CURRENT_TERMS_VERSION;
}
