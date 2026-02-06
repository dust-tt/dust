import type {
  OAuthConnectionType,
  OAuthCredentials,
  OAuthProvider,
  OAuthUseCase,
} from "../../oauth/lib";
import { isOAuthConnectionType } from "../../oauth/lib";
import { isDevelopment } from "../../shared/env";
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
    // Pass opener origin through OAuth flow so finalize page can postMessage back
    const openerOrigin = window.location.origin;
    let url = `${dustClientFacingUrl}/w/${owner.sId}/oauth/${provider}/setup?useCase=${useCase}&openerOrigin=${encodeURIComponent(openerOrigin)}`;
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
    // Accept messages from dustClientFacingUrl origin (OAuth popup runs on NextJS server)
    // In dev, bypass origin check as an extra safeguard for cross-port communication
    const expectedOrigin = new URL(dustClientFacingUrl).origin;
    const handleWindowMessage = (event: MessageEvent) => {
      if (!isDevelopment() && event.origin !== expectedOrigin) {
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // BroadcastChannel not supported
    }

    const cleanup = () => {
      window.removeEventListener("message", handleWindowMessage);
      if (channel) {
        channel.close();
      }
    };
  });
}
