import type {
  OAuthConnectionType,
  OAuthCredentials,
  OAuthProvider,
  OAuthUseCase,
} from "../../oauth/lib";
import { isOAuthConnectionType } from "../../oauth/lib";
import type { Result } from "../../shared/result";
import { Err, Ok } from "../../shared/result";
import type { LightWorkspaceType } from "../../user";

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
  extraConfig: OAuthCredentials;
}): Promise<Result<OAuthConnectionType, Error>> {
  return new Promise((resolve) => {
    // Clear any stale OAuth data from previous attempts
    const storageKey = `oauth_finalize_${provider}`;
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      // Ignore localStorage errors
    }

    let url = `${dustClientFacingUrl}/w/${owner.sId}/oauth/${provider}/setup?useCase=${useCase}`;
    if (extraConfig) {
      url += `&extraConfig=${encodeURIComponent(JSON.stringify(extraConfig))}`;
    }
    const oauthPopup = window.open(url);
    let authComplete = false;

    const handleFinalization = (data: any) => {
      if (authComplete) {
        return; // Already processed
      }

      if (data.type === "connection_finalized" && data.provider === provider) {
        authComplete = true;
        const { error, connection } = data;

        cleanup();
        oauthPopup?.close();

        if (error) {
          resolve(new Err(new Error(error)));
        } else if (
          connection &&
          isOAuthConnectionType(connection) &&
          connection.provider === provider
        ) {
          resolve(new Ok(connection));
        } else {
          resolve(
            new Err(
              new Error("Invalid connection data received from auth window")
            )
          );
        }
      }
    };

    // Method 1: window.postMessage (preferred, direct communication)
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      handleFinalization(event.data);
    };

    window.addEventListener("message", handleWindowMessage);

    // Method 2: BroadcastChannel (fallback)
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("oauth_finalize");
      channel.addEventListener("message", (event: MessageEvent) => {
        handleFinalization(event.data);
      });
    } catch (e) {
      // BroadcastChannel not supported, will use localStorage
    }

    const cleanup = () => {
      window.removeEventListener("message", handleWindowMessage);
      if (channel) {
        channel.close();
      }
    };
  });
}
