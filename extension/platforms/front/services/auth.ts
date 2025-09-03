import { DUST_US_URL, FRONT_EXTENSION_URL } from "@app/shared/lib/config";
import { generatePKCE } from "@app/shared/lib/utils";
import type { StoredTokens } from "@app/shared/services/auth";
import {
  AuthError,
  AuthService,
  getConnectionDetails,
  getDustDomain,
} from "@app/shared/services/auth";
import type { StorageService } from "@app/shared/services/storage";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { jwtDecode } from "jwt-decode";

const POPUP_CONFIG = {
  WIDTH: 600,
  HEIGHT: 700,
  CHECK_INTERVAL_MS: 100,
} as const;

const DEFAULT_TOKEN_EXPIRY = 5 * 60; // 5 minutes in seconds

interface PopupResult<T = void> {
  data?: T;
  error?: Error;
}

const openAndWaitForPopup = async <T>(
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
      }

      try {
        const result = checkForResult(popup);
        if (result) {
          clearInterval(checkPopup);
          popup.close();
          resolve(result);
        }
      } catch (e) {
        // Ignore errors accessing popup location (cross-origin)
        console.log("[Dust Auth] Error accessing popup location:", e);
      }
    }, POPUP_CONFIG.CHECK_INTERVAL_MS);
  });
};

export class FrontAuthService extends AuthService {
  constructor(storage: StorageService) {
    super(storage);
  }

  private async openAuthPopup(
    options: Record<string, string>
  ): Promise<{ code: string }> {
    const queryString = new URLSearchParams(options).toString();
    const authUrl = `${DUST_US_URL}/api/v1/auth/authorize?${queryString}`;

    const result = await openAndWaitForPopup<{
      code: string;
    }>(authUrl, "Authentication", (popup) => {
      const popupUrl = popup.location.href;
      if (popupUrl?.includes("code=")) {
        const popupUrlAsUrl = new URL(popupUrl);
        const code = popupUrlAsUrl.searchParams.get("code");

        return code ? { data: { code } } : null;
      }
      return null;
    });

    if (result.error) {
      throw result.error;
    }

    if (!result.data?.code) {
      throw new Error("No code received from authentication");
    }

    return result.data;
  }

  async login({ forcedConnection }: { forcedConnection?: string }) {
    const { codeVerifier, codeChallenge } = await generatePKCE();

    // Store code verifier for later use
    await this.storage.set("code_verifier", codeVerifier);

    try {
      const options: Record<string, string> = {
        response_type: "code",
        redirect_uri: FRONT_EXTENSION_URL,
        code_challenge_method: "S256",
        code_challenge: codeChallenge,
        provider: "authkit",
        connection: forcedConnection ?? "",
      };

      const result = await this.openAuthPopup(options);

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
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || "",
        expiresIn: data.expires_in || DEFAULT_TOKEN_EXPIRY,
      });

      const claims = jwtDecode<Record<string, string>>(data.access_token);

      const dustDomain = getDustDomain(claims);
      const connectionDetails = getConnectionDetails(claims);

      if (
        data.authentication_method === "SSO" &&
        !connectionDetails.connectionStrategy
      ) {
        connectionDetails.connectionStrategy = data.authentication_method;
      }

      // Get user details and workspaces
      const res = await this.fetchMe({
        accessToken: data.access_token,
        dustDomain,
      });

      if (res.isErr()) {
        return res;
      }

      const workspaces = res.value.user.workspaces;

      const selectedWorkspace =
        workspaces.find((w) => w.sId === res.value.user.selectedWorkspace) ||
        workspaces[0];

      const storedUser = await this.saveUser({
        ...res.value.user,
        ...connectionDetails,
        dustDomain,
        selectedWorkspace: selectedWorkspace?.sId ?? null,
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
      return true;
    }

    const logoutUrl = `${user.dustDomain}/api/v1/auth/logout?${new URLSearchParams(
      queryParams
    )}`;

    const result = await openAndWaitForPopup<void>(
      logoutUrl,
      "Logout",
      (popup) => {
        const popupUrl = popup.location.href;
        return popupUrl.includes(FRONT_EXTENSION_URL)
          ? { data: undefined }
          : null;
      }
    );

    if (result.error) {
      throw result.error;
    }

    return true;
  }

  async getAccessToken(forceRefresh?: boolean): Promise<string | null> {
    let tokens = await this.getStoredTokens();
    if (
      !tokens ||
      !tokens.accessToken ||
      tokens.expiresAt < Date.now() ||
      forceRefresh
    ) {
      const refreshRes = await this.refreshToken();
      if (refreshRes.isOk()) {
        tokens = refreshRes.value;
      } else {
        tokens = null;
      }
    }

    return tokens?.accessToken ?? null;
  }

  async refreshToken(): Promise<Result<StoredTokens, AuthError>> {
    try {
      const tokenParams: Record<string, string> = {
        grant_type: "refresh_token",
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
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || "",
        expiresIn: data.expires_in || DEFAULT_TOKEN_EXPIRY,
      });
      return new Ok(storedTokens);
    } catch (error) {
      return new Err(
        new AuthError("invalid_oauth_token_error", error?.toString())
      );
    }
  }
}
