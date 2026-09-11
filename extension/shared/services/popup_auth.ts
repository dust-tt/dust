const POPUP_CONFIG = {
  WIDTH: 600,
  HEIGHT: 700,
  CHECK_INTERVAL_MS: 100,
} as const;

export interface PopupResult<T = void> {
  data?: T;
  error?: Error;
}

/**
 * Opens `url` in a centered popup window and polls it with `checkForResult`
 * until it returns a non-null result (or the user closes the popup).
 *
 * Used by platforms that run as a plain web page and therefore cannot rely on
 * `chrome.identity` to complete the OAuth dance. `checkForResult` typically
 * reads `popup.location`, which only becomes readable once the popup has
 * navigated back to the extension's own origin (the OAuth `redirect_uri`).
 */
export const openAndWaitForPopup = async <T>(
  url: string,
  title: string,
  checkForResult: (popup: Window) => PopupResult<T> | null
): Promise<PopupResult<T>> => {
  const left = window.screenX + (window.outerWidth - POPUP_CONFIG.WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_CONFIG.HEIGHT) / 2;

  const popup = window.open(
    url,
    title,
    `width=${POPUP_CONFIG.WIDTH},height=${POPUP_CONFIG.HEIGHT},left=${left},top=${top}`
  );

  if (!popup) {
    return { error: new Error("Popup blocked") };
  }

  return new Promise((resolve) => {
    const checkPopup = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkPopup);
        resolve({ error: new Error("Authentication cancelled") });
        return;
      }

      try {
        const result = checkForResult(popup);
        if (result) {
          clearInterval(checkPopup);
          popup.close();
          resolve(result);
        }
      } catch {
        // Expected on every tick until the popup navigates back to our own
        // origin: reading `location` across origins throws. Not logged — this
        // poll runs every 100ms for the whole provider-side flow.
      }
    }, POPUP_CONFIG.CHECK_INTERVAL_MS);
  });
};

/**
 * Extracts the OAuth `code` query parameter from a popup that has navigated
 * back to the extension's origin. Shaped as an `openAndWaitForPopup` checker.
 */
export const checkForOAuthCode = (
  popup: Window
): PopupResult<{ code: string }> | null => {
  const popupUrl = popup.location.href;
  if (popupUrl?.includes("code=")) {
    const code = new URL(popupUrl).searchParams.get("code");

    return code ? { data: { code } } : null;
  }
  return null;
};
