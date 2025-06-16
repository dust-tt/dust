import {
  DUST_API_AUDIENCE,
  FRONT_EXTENSION_URL,
  getOAuthClientID,
  DUST_US_URL,
} from "@app/shared/lib/config";
import type { StoredTokens } from "@app/shared/services/auth";
import {
  AuthError,
  AuthService,
  getDustDomain,
} from "@app/shared/services/auth";
import type { StorageService } from "@app/shared/services/storage";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { jwtDecode } from "jwt-decode";
import { generatePKCE } from "@app/shared/lib/utils";

export class FrontAuthService extends AuthService {
  private popupWindow: Window | null = null;

  constructor(storage: StorageService) {
    super(storage);
  }

  private async openAuthPopup(
    options: Record<string, string>
  ): Promise<Window> {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const queryString = new URLSearchParams(options).toString();
    const authUrl = `${DUST_US_URL}/api/v1/auth/authorize?${queryString}`;

    console.log("[WorkOS Auth] Opening popup with URL:", authUrl);

    const popup = window.open(
      authUrl,
      "WorkOS Auth",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      console.log("[WorkOS Auth] Popup blocked by browser");
      throw new Error("Popup blocked");
    }

    console.log("[WorkOS Auth] Popup opened successfully");
    return popup;
  }

  async login({
    isForceLogin,
    forcedConnection,
  }: {
    isForceLogin?: boolean;
    forcedConnection?: string;
  }) {
    const { codeVerifier, codeChallenge } = await generatePKCE();

    // Store code verifier for later use
    await this.storage.set("code_verifier", codeVerifier);

    try {
      const options: Record<string, string> = {
        response_type: "code",
        redirect_uri: FRONT_EXTENSION_URL,
        code_challenge_method: "S256",
        code_challenge: codeChallenge,
      };
      // AUTH0 SPECIFICS
      options.audience = DUST_API_AUDIENCE;
      options.prompt = isForceLogin ? "login" : "";
      // WORKOS SPECIFICS
      options.provider = "authkit";
      options.connection = forcedConnection ?? "";

      this.popupWindow = await this.openAuthPopup(options);

      // Wait for the popup to complete authentication
      const result = await new Promise<{ code: string }>((resolve, reject) => {
        const checkPopup = setInterval(() => {
          if (this.popupWindow?.closed) {
            clearInterval(checkPopup);
            reject(new Error("Authentication cancelled"));
          }

          try {
            // Check if we have the auth code in the popup URL
            const popupUrl = this.popupWindow?.location.href;
            if (popupUrl?.includes("code=")) {
              const code = new URL(popupUrl).searchParams.get("code");
              if (code) {
                clearInterval(checkPopup);
                this.popupWindow?.close();
                resolve({ code });
              }
            }
          } catch (e) {
            // Ignore cross-origin errors
          }
        }, 100);
      });

      // Get the stored code verifier
      const storedCodeVerifier =
        await this.storage.get<string>("code_verifier");
      if (!storedCodeVerifier) {
        return new Err(
          new AuthError("not_authenticated", "No code verifier found")
        );
      }

      const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        code_verifier: storedCodeVerifier,
        code: result.code,
        redirect_uri: FRONT_EXTENSION_URL,
      });
      const response = await fetch(`${DUST_US_URL}/api/v1/auth/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: FRONT_EXTENSION_URL,
        },
        credentials: "include",
        body: tokenParams,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Err(
          new AuthError(
            "invalid_oauth_token_error",
            `Token exchange failed: ${response.status} ${response.statusText}. Error: ${errorText}`
          )
        );
      }

      const data = await response.json();

      await this.storage.delete("code_verifier");

      // Store tokens
      const tokens = await this.saveTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token || "",
        expiresIn: data.expires_in || 60,
      });

      const claims = jwtDecode<Record<string, string>>(data.access_token);
      // Get user details and workspaces
      const res = await this.fetchMe({
        accessToken: data.access_token,
        dustDomain: getDustDomain(claims),
      });

      if (res.isErr()) {
        return res;
      }

      const workspaces = res.value.user.workspaces;
      const storedUser = await this.saveUser({
        ...res.value.user,
        dustDomain: getDustDomain(claims),
        selectedWorkspace: workspaces.length === 1 ? workspaces[0].sId : null,
      });
      return new Ok({ tokens, user: storedUser });
    } catch (error) {
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }
  }

  async logout(): Promise<boolean> {
    const queryParams: Record<string, string> = {
      returnTo: FRONT_EXTENSION_URL,
    };

    const accessToken = await this.getAccessToken();
    if (accessToken) {
      const decodedPayload = jwtDecode<Record<string, string>>(accessToken);
      if (decodedPayload) {
        queryParams.session_id = decodedPayload.sid || "";
      }
    }

    const user = await this.getStoredUser();
    if (!user) {
      return false;
    }

    const logoutUrl = `${user.dustDomain}/api/v1/auth/logout?${new URLSearchParams(
      queryParams
    )}`;

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      logoutUrl,
      "Logout",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      console.log("[Logout] Popup blocked by browser");
      throw new Error("Popup blocked");
    }

    // Wait for the popup to complete logout
    await new Promise<void>((resolve, reject) => {
      const checkPopup = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopup);
          resolve();
        }

        try {
          // Check if we have reached the returnTo URL
          const popupUrl = popup.location.href;
          if (popupUrl.includes(FRONT_EXTENSION_URL)) {
            clearInterval(checkPopup);
            popup.close();
            resolve();
          }
        } catch (e) {
          // Ignore cross-origin errors
        }
      }, 100);
    });

    this.storage.clear();
    return true;
  }

  async getAccessToken(): Promise<string | null> {
    let tokens = await this.getStoredTokens();
    if (!tokens || !tokens.accessToken || tokens.expiresAt < Date.now()) {
      const refreshRes = await this.refreshToken();
      if (refreshRes.isOk()) {
        tokens = refreshRes.value;
      }
    }
    return tokens?.accessToken ?? null;
  }

  async refreshToken(): Promise<Result<StoredTokens, AuthError>> {
    console.log("[refreshToken] Attempting to refresh token...");
    try {
      const tokenParams: Record<string, string> = {
        grant_type: "refresh_token",
        client_id: getOAuthClientID("workos"),
        refresh_token: (await this.getStoredTokens())?.refreshToken || "",
      };

      if (!tokenParams.refresh_token) {
        return new Err(
          new AuthError("invalid_oauth_token_error", "No refresh token")
        );
      }

      const user = await this.getStoredUser();
      if (!user) {
        return new Err(
          new AuthError("invalid_oauth_token_error", "No user found")
        );
      }

      const response = await fetch(
        `${user.dustDomain}/api/v1/auth/authenticate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(tokenParams),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          `Token refresh failed: ${data.error} - ${data.error_description}`
        );
      }

      const data = await response.json();
      const storedTokens = await this.saveTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token || "",
        expiresIn: data.expires_in || 60,
      });
      console.log("[refreshToken] Tokens saved successfully");
      return new Ok(storedTokens);
    } catch (error) {
      console.error("[refreshToken] Error during token refresh:");
      return new Err(
        new AuthError("invalid_oauth_token_error", error?.toString())
      );
    }
  }
}
