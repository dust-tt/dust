import config from "@app/lib/api/config";
import type { CellInfo } from "@app/types/cell";
import type { APIError } from "@app/types/error";
import { isAPIError } from "@app/types/error";
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

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling] finalize-api-error
 * When the OAuth finalize call fails, the result MUST be an `Err` holding the `APIError` returned by
 * the server (posted by `OAuthFinalizePage` as `apiError`), so callers can show it through
 * `formatError`. Other failures (invalid payload from the auth window) are an `Err` with an `Error`.
 */
export async function setupOAuthConnection({
  owner,
  provider,
  useCase,
  extraConfig,
  cellInfo,
}: {
  owner: LightWorkspaceType;
  provider: OAuthProvider;
  useCase: OAuthUseCase;
  extraConfig: OAuthCredentials;
  cellInfo: CellInfo | null;
}): Promise<Result<OAuthConnectionType, APIError | Error>> {
  return new Promise((resolve) => {
    const oauthBaseUrl = config.getAppUrl();
    // Pass opener origin through OAuth flow so finalize page can postMessage back
    const openerOrigin = window.location.origin;
    let url = `${oauthBaseUrl}/w/${owner.sId}/oauth/${provider}/setup?useCase=${useCase}&openerOrigin=${encodeURIComponent(openerOrigin)}`;
    if (extraConfig) {
      url += `&extraConfig=${encodeURIComponent(JSON.stringify(extraConfig))}`;
    }
    // Pass region so the OAuth popup's CellContext initializes with the correct API URL.
    if (cellInfo) {
      url += `&cell=${encodeURIComponent(cellInfo.name)}`;
    }
    const oauthPopup = window.open(url);
    let authComplete = false;

    const handleFinalization = (data: any) => {
      if (authComplete) {
        return; // Already processed
      }

      if (data.type === "connection_finalized" && data.provider === provider) {
        authComplete = true;
        const { apiError, error, connection } = data;

        cleanup();
        oauthPopup?.close();

        if (isAPIError(apiError)) {
          resolve(new Err(apiError));
        } else if (typeof error === "string") {
          // Auth windows deployed before `apiError` only post the message.
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
    // The finalize page runs on the app (SPA), same origin as the opener.
    // In dev, bypass origin check as an extra safeguard for cross-port communication.
    const expectedOrigin = new URL(oauthBaseUrl).origin;
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
    } catch {
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
