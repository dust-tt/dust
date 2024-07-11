import type { OAuthProvider, WorkspaceType } from "@dust-tt/types";

import type { OAuthUseCase } from "@app/lib/api/oauth";

export async function auth({
  owner,
  provider,
  useCase,
  dustClientFacingUrl,
}: {
  owner: WorkspaceType;
  provider: OAuthProvider;
  useCase: OAuthUseCase;
  dustClientFacingUrl: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauthPopup = window.open(
      `${dustClientFacingUrl}/w/${owner.sId}/oauth/${provider}/redirect?useCase=${useCase}`
    );
    let authComplete = false;

    const popupMessageEventListener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data.type === "connection_finalized") {
        authComplete = true;
        resolve(event.data.connectionId);
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
