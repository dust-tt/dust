import type { CellInfo } from "@app/types/cell";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  isOfficeDialogAvailable,
  openOfficeDialog,
} from "@extension/platforms/excel/services/office_dialog";
import { DUST_US_URL, EXCEL_EXTENSION_URL } from "@extension/shared/lib/config";
import { generatePKCE } from "@extension/shared/lib/utils";
import type { StoredTokens } from "@extension/shared/services/auth";
import {
  AuthError,
  AuthService,
  getCellInfoFromClaims,
} from "@extension/shared/services/auth";
import {
  checkForOAuthCode,
  openAndWaitForPopup,
} from "@extension/shared/services/popup_auth";
import type { StorageService } from "@extension/shared/services/storage";
import { jwtDecode } from "jwt-decode";

/**
 * OAuth `redirect_uri` for the Excel add-in, and the page the sign-in dialog
 * is pointed at.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:security] auth-relay-is-same-origin-and-registered
 * `EXCEL_AUTH_RELAY_URL` must resolve to a page served from the add-in's own
 * origin (`EXCEL_EXTENSION_URL`) and must be registered as an allowed redirect
 * URI on the WorkOS client: an Office dialog can only return the authorization
 * code to the task pane from a same-origin page.
 */
export const EXCEL_AUTH_RELAY_URL = `${EXCEL_EXTENSION_URL}/auth.html`;

export class ExcelAuthService extends AuthService {
  constructor(storage: StorageService, cells?: CellInfo[]) {
    super(storage, cells);
  }

  /**
   * Runs the interactive part of the OAuth flow and returns the resulting code.
   *
   * Inside Excel this goes through the Office Dialog API; when the task pane is
   * opened directly in a browser (the usual local development setup) it falls
   * back to a polled popup, the way the Front plugin does.
   */
  /**
   * @cc [owner:Nils-Fedrigo,label:coding] taskpane-must-outlive-its-dialog
   * Nothing may reload the task pane while a dialog is open: the dialog holds
   * the promise this method awaits, and a reload destroys the context that
   * would settle it, leaving the dialog orphaned and the host reporting it as
   * unloadable. In development that means the dev server must not live-reload
   * on writes to its own output directory — see `devServer.static.watch`.
   */
  /**
   * @cc [owner:Nils-Fedrigo,label:security] auth-dialog-navigates-over-https-only
   * Every URL the sign-in dialog loads — the relay, the login endpoint it
   * forwards to, and the identity provider — must be HTTPS. An Office dialog
   * rejects an HTTP page with error 12003 and replaces itself with the host's
   * generic "we can't load the add-in" screen, so a plain-HTTP local Dust URL
   * has to be reached through the dev server's same-origin HTTPS proxy rather
   * than directly.
   */
  private async getAuthorizationCode(
    options: Record<string, string>
  ): Promise<{ code: string }> {
    const queryString = new URLSearchParams(options).toString();

    // In development `DUST_US_URL` is the add-in's own HTTPS origin, whose dev
    // server proxies `/api` to the local Dust — the only way to reach a
    // plain-HTTP local Dust from inside a dialog, per the contract above.
    const authUrl = `${DUST_US_URL}/api/workos/login?${queryString}`;

    // Opened directly on the login endpoint rather than routed through the
    // relay: a dialog refuses to *navigate* from a loaded page on the add-in's
    // own domain to one that redirects off it (error 12002, observed on Excel
    // for Mac with both a scripted and a user-initiated navigation), while the
    // redirects an initial load follows are its own. The relay is still the
    // `redirect_uri`, so the flow ends on our origin where `messageParent`
    // works.
    const result = isOfficeDialogAvailable()
      ? await openOfficeDialog<{ code: string }>(authUrl)
      : await openAndWaitForPopup(authUrl, "Authentication", checkForOAuthCode);

    if (result.error) {
      throw result.error;
    }

    if (!result.data?.code) {
      throw new Error("No code received from authentication");
    }

    return result.data;
  }

  async login({
    forcedConnection,
    organizationId,
  }: {
    forcedConnection?: string;
    organizationId?: string;
  }) {
    if (!this.cells) {
      return new Err(new AuthError("not_authenticated", "No cells found."));
    }

    const { codeVerifier, codeChallenge } = await generatePKCE();

    // Store code verifier for later use
    await this.storage.set("code_verifier", codeVerifier);

    try {
      const options: Record<string, string> = {
        redirect_uri: EXCEL_AUTH_RELAY_URL,
        code_challenge_method: "S256",
        code_challenge: codeChallenge,
        connection: forcedConnection ?? "",
        ...(organizationId ? { organizationId } : {}),
      };

      const result = await this.getAuthorizationCode(options);

      // Get the stored code verifier
      const storedCodeVerifier =
        await this.storage.get<string>("code_verifier");
      if (!storedCodeVerifier) {
        return new Err(
          new AuthError("not_authenticated", "No code verifier found")
        );
      }

      const tokenParams = new URLSearchParams({
        code_verifier: storedCodeVerifier,
        code: result.code,
      });
      const response = await fetch(`${DUST_US_URL}/api/workos/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: EXCEL_EXTENSION_URL,
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
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || "",
        expirationDate: data.expirationDate,
      });

      const claims = jwtDecode<Record<string, string>>(data.accessToken);

      const cellInfo = getCellInfoFromClaims(claims, this.cells);

      await this.storage.set("cellInfo", cellInfo);

      return new Ok({ tokens, cellInfo });
    } catch (error) {
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }
  }

  async logout(): Promise<boolean> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return true;
    }

    const decodedPayload = jwtDecode<Record<string, string>>(accessToken);
    const sessionId = decodedPayload?.sid;
    if (!sessionId) {
      return true;
    }

    const cellInfo = await this.getCellInfoFromStorage();
    if (!cellInfo) {
      return true;
    }

    const response = await fetch(`${cellInfo.url}/api/workos/revoke-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "omit",
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!response.ok) {
      throw new Error(`Revoke session failed: ${response.status}`);
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
      const refreshRes = await this.refreshToken(tokens);
      if (refreshRes.isOk()) {
        tokens = refreshRes.value;
      } else {
        tokens = null;
      }
    }

    return tokens?.accessToken ?? null;
  }

  async refreshToken(
    tokens: StoredTokens | null
  ): Promise<Result<StoredTokens, AuthError>> {
    try {
      tokens = tokens ?? (await this.getStoredTokens());
      if (!tokens) {
        return new Err(new AuthError("not_authenticated", "No tokens found."));
      }

      const tokenParams: Record<string, string> = {
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken ?? "",
      };

      const cellInfo = await this.getCellInfoFromStorage();
      if (!cellInfo) {
        return new Err(
          new AuthError("invalid_oauth_token_error", "No cell info found")
        );
      }

      const response = await fetch(`${cellInfo.url}/api/workos/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenParams),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          `Token refresh failed: ${data.error} - ${data.error_description}`
        );
      }

      const data = await response.json();
      const storedTokens = await this.saveTokens({
        success: true,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || "",
        expirationDate: data.expirationDate,
      });
      return new Ok(storedTokens);
    } catch (error) {
      return new Err(
        new AuthError("invalid_oauth_token_error", error?.toString())
      );
    }
  }
}
