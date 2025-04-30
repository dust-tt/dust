import { LightWorkspaceType } from "../../front/user";
import {
  isOAuthConnectionType,
  OAuthConnectionType,
  OAuthProvider,
  OAuthUseCase,
} from "../../oauth/lib";
import { Err, Ok, Result } from "../../shared/result";

export async function setupOAuthConnection({
  dustClientFacingUrl,
  owner,
  provider,
  useCase,
  extraConfig,
}: {
  dustClientFacingUrl: string;
  owner: LightWorkspaceType;
  provider: OAuthProvider;
  useCase: OAuthUseCase;
  extraConfig: Record<string, string>;
}): Promise<Result<OAuthConnectionType, Error>> {
  return new Promise((resolve) => {
    let url = `${dustClientFacingUrl}/w/${owner.sId}/oauth/${provider}/setup?useCase=${useCase}`;
    if (extraConfig) {
      url += `&extraConfig=${encodeURIComponent(JSON.stringify(extraConfig))}`;
    }
    const oauthPopup = window.open(url);
    let authComplete = false;

    const popupMessageEventListener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data.type === "connection_finalized") {
        authComplete = true;
        const { error, connection } = event.data;
        if (error) {
          resolve(new Err(new Error(error)));
        } else if (connection && isOAuthConnectionType(connection)) {
          resolve(new Ok(connection));
        } else {
          resolve(
            new Err(
              new Error("Invalid connection data received from auth window")
            )
          );
        }
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
            resolve(
              new Err(new Error("User closed the window before auth completed"))
            );
          }
        }, 100);
      }
    }, 100);
  });
}
