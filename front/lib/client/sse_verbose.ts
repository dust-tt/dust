const SSE_VERBOSE_STORAGE_KEY = "dust_sse_verbose";

function readStoredSseVerbose(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return sessionStorage.getItem(SSE_VERBOSE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

let sseVerbose = readStoredSseVerbose();

export function isSseVerbose(): boolean {
  return sseVerbose;
}

/**
 * @cc [owner:id13,label:logging;performance] dev-console-sse-verbose-toggle
 * Changing the dev console's SSE logging switch MUST take effect immediately and persist for
 * the current browser tab when storage is available. Storage failure MUST NOT block the live switch.
 */
export function setSseVerbose(enabled: boolean): void {
  sseVerbose = enabled;
  try {
    if (enabled) {
      sessionStorage.setItem(SSE_VERBOSE_STORAGE_KEY, "true");
    } else {
      sessionStorage.removeItem(SSE_VERBOSE_STORAGE_KEY);
    }
  } catch {
    return;
  }
}
