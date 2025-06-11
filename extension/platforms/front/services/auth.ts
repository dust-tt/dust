import {
  WORKOS_CLIENT_ID,
  WORKOS_DOMAIN,
  DUST_API_AUDIENCE,
  FRONT_EXTENSION_URL,
} from "@app/shared/lib/config";
import type { StoredTokens, StoredUser } from "@app/shared/services/auth";
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
import { generatePKCE } from "@app/shared/lib/utils";

const API_SCOPES =
  "offline_access read:user_profile read:conversation create:conversation update:conversation read:agent read:file create:file delete:file";

export class FrontAuthService extends AuthService {
  private workosClientId: string;
  private popupWindow: Window | null = null;

  constructor(storage: StorageService) {
    super(storage);
    this.workosClientId = WORKOS_CLIENT_ID;
  }

  private async openAuthPopup(provider: string): Promise<Window> {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    // Generate PKCE values
    const { codeVerifier, codeChallenge } = await generatePKCE();
    
    // Store code verifier for later use
    await this.storage.set('code_verifier', codeVerifier);

    const options: Record<string, string> = {
      client_id: this.workosClientId,
      response_type: "code",
      redirect_uri: FRONT_EXTENSION_URL,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
      scope: "openid profile email",
      provider: "authkit"
    };

    const queryString = new URLSearchParams(options).toString();
    const authUrl = `https://${WORKOS_DOMAIN}/user_management/authorize?${queryString}`;

    console.log('[WorkOS Auth] Opening popup with URL:', authUrl);

    const popup = window.open(
      authUrl,
      'WorkOS Auth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      console.log('[WorkOS Auth] Popup blocked by browser');
      throw new Error('Popup blocked');
    }

    console.log('[WorkOS Auth] Popup opened successfully');
    return popup;
  }

  async login({
    isForceLogin,
    forcedConnection,
  }: {
    isForceLogin?: boolean;
    forcedConnection?: string;
  }) {
    try {
      console.log('[WorkOS Auth] Starting login flow:', { isForceLogin, forcedConnection });

      // Open the popup with the selected provider
      this.popupWindow = await this.openAuthPopup("authkit");
      console.log('[WorkOS Auth] Popup opened, waiting for authentication...');

      // Wait for the popup to complete authentication
      const result = await new Promise<{ code: string }>((resolve, reject) => {
        const checkPopup = setInterval(() => {
          if (this.popupWindow?.closed) {
            console.log('[WorkOS Auth] Popup closed without completing authentication');
            clearInterval(checkPopup);
            reject(new Error('Authentication cancelled'));
          }

          try {
            // Check if we have the auth code in the popup URL
            const popupUrl = this.popupWindow?.location.href;
            if (popupUrl?.includes('code=')) {
              const code = new URL(popupUrl).searchParams.get('code');
              if (code) {
                console.log('[WorkOS Auth] Received auth code from popup');
                clearInterval(checkPopup);
                this.popupWindow?.close();
                resolve({ code });
              }
            }
          } catch (e) {
            // Ignore cross-origin errors
            console.log('[WorkOS Auth] Cross-origin error while checking popup URL:', e);
          }
        }, 100);
      });

      // Get the stored code verifier
      const storedCodeVerifier = await this.storage.get<string>('code_verifier');
      if (!storedCodeVerifier) {
        console.log('[WorkOS Auth] No code verifier found');
        return new Err(new AuthError("not_authenticated", "No code verifier found"));
      }

      console.log('[WorkOS Auth] Exchanging code for tokens...');
      
      const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.workosClientId,
        code_verifier: storedCodeVerifier,
        code: result.code,
        redirect_uri: FRONT_EXTENSION_URL,
      });

      const response = await fetch(`https://${WORKOS_DOMAIN}/user_management/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Origin": FRONT_EXTENSION_URL,
        },
        credentials: "include",
        body: tokenParams,
      });
      console.log('[WorkOS Auth] Raw token exchange response:', response);
      console.log('[WorkOS Auth] Token exchange response headers:', [...response.headers.entries()]);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('[WorkOS Auth] Token exchange failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        return new Err(new AuthError("not_authenticated", `Token exchange failed: ${response.status} ${response.statusText}. Error: ${errorText}`));
      }

      const data = await response.json();
      console.log('[WorkOS Auth] Token exchange successful');

      // Clear the code verifier
      await this.storage.delete('code_verifier');

      // Store tokens
      const tokens = await this.saveTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token || '',
        expiresIn: data.expires_in || 3600,
      });

      // Get user details and workspaces
      const res = await this.fetchMe({
        accessToken: data.access_token,
        dustDomain: data.user?.organizationId,
      });

      if (res.isErr()) {
        console.log('[WorkOS Auth] Failed to fetch user details:', res.error);
        return res;
      }

      const workspaces = res.value.user.workspaces;
      const storedUser = await this.saveUser({
        ...res.value.user,
        dustDomain: data.user?.organizationId,
        selectedWorkspace: workspaces.length === 1 ? workspaces[0].sId : null,
      });

      console.log('[WorkOS Auth] Login flow completed successfully');
      return new Ok({ tokens, user: storedUser });
    } catch (error) {
      console.log('[WorkOS Auth] Login flow failed:', error);
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }
  }

  async logout(): Promise<boolean> {
    console.log('[WorkOS Auth] Logging out...');
    await this.storage.clear();
    console.log('[WorkOS Auth] Logout completed');
    return true;
  }

  async getAccessToken(): Promise<string | null> {
    const tokens = await this.getStoredTokens();
    console.log('[WorkOS Auth] Getting access token:', { hasToken: !!tokens?.accessToken });
    return tokens?.accessToken ?? null;
  }

  async refreshToken(): Promise<Result<StoredTokens, AuthError>> {
    console.log('[WorkOS Auth] Refreshing token...');
    try {
      // For WorkOS, we'll need to re-authenticate since they handle refresh internally
      const loginResult = await this.login({});
      if (loginResult.isErr()) {
        console.log('[WorkOS Auth] Token refresh failed:', loginResult.error);
        return loginResult;
      }
      console.log('[WorkOS Auth] Token refresh successful');
      return new Ok(loginResult.value.tokens);
    } catch (error) {
      console.log('[WorkOS Auth] Token refresh failed with error:', error);
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }
  }
}
