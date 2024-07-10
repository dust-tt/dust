import type { OAuthProvider } from "@dust-tt/types";

export async function auth(
  dustClientFacingUrl: string,
  provider: OAuthProvider
): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauthPopup = window.open(
      `${dustClientFacingUrl}/oauth/${provider}/redirect`
    );
    let authComplete = false;

    const popupMessageEventListener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data.type === "connection_finalized") {
        authComplete = true;
        resolve(event.data.connection_id);
        window.removeEventListener("message", popupMessageEventListener);
        oauthPopup?.close();
      }
    };

    window.addEventListener("message", popupMessageEventListener);

    const checkPopupStatus = setInterval(() => {
      if (oauthPopup && oauthPopup.closed) {
        window.removeEventListener("message", popupMessageEventListener);
        clearInterval(checkPopupStatus);
        setTimeout(() => {
          if (!authComplete) {
            reject(new Error("User closed the window before auth completed"));
          }
        }, 100);
      }
    }, 100);
  });
}
