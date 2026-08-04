const KEY = "moto_anjo_intro_hidden";

export function isIntroHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setIntroHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (hidden) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
