import logger from "@app/logger/logger";
import type { CellInfo } from "@app/types/cell";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { openAuthDialog } from "@extension/platforms/excel/dialog/openAuthDialog";
import { DUST_US_URL } from "@extension/shared/lib/config";
import { generatePKCE } from "@extension/shared/lib/utils";
import type {
  LoginResult,
  StoredTokens,
} from "@extension/shared/services/auth";
import {
  AuthError,
  AuthService,
  postWorkOSAuthenticate,
  revokeWorkOSSession,
} from "@extension/shared/services/auth";
import type { StorageService } from "@extension/shared/services/storage";

export class ExcelAuthService extends AuthService {
  constructor(storage: StorageService, cells?: CellInfo[]) {
    super(storage, cells);
  }

  async login({
    organizationId,
  }: {
    organizationId?: string;
  }): Promise<Result<LoginResult, AuthError>> {
    if (!this.cells) {
      return new Err(new AuthError("not_authenticated", "No cells found."));
    }

    // The code verifier stays in memory in the task pane. Only the challenge goes to the dialog.
    const { codeVerifier, codeChallenge } = await generatePKCE();

    const codeRes = await openAuthDialog({
      codeChallenge,
      organizationId,
    });
    if (codeRes.isErr()) {
      return new Err(new AuthError("not_authenticated", codeRes.error.message));
    }

    const tokensRes = await postWorkOSAuthenticate(DUST_US_URL, {
      code: codeRes.value,
      code_verifier: codeVerifier,
    });
    if (tokensRes.isErr()) {
      return new Err(
        new AuthError(
          "invalid_oauth_token_error",
          `Token exchange failed: ${tokensRes.error.message}`
        )
      );
    }

    const loginResult = await this.saveLogin(tokensRes.value, this.cells);
    return new Ok(loginResult);
  }

  // Revokes the WorkOS session, then clears the stored data. The stored data is cleared even if
  // the revocation fails, so that the user is always signed out.
  async logout(): Promise<boolean> {
    const accessToken = await this.getAccessToken();
    const cellInfo = await this.getCellInfoFromStorage();
    if (accessToken && cellInfo) {
      const revokeRes = await revokeWorkOSSession(cellInfo.url, accessToken);
      if (revokeRes.isErr()) {
        logger.warn({ err: revokeRes.error }, "Revoke session failed.");
      }
    }

    await this.clearStoredData();
    return true;
  }

  async getAccessToken(forceRefresh?: boolean): Promise<string | null> {
    const tokens = await this.getStoredTokens();
    if (tokens && tokens.expiresAt > Date.now() && !forceRefresh) {
      return tokens.accessToken;
    }

    const refreshRes = await this.refreshToken();
    if (refreshRes.isOk()) {
      return refreshRes.value.accessToken;
    }

    const current = await this.getStoredTokens();
    return current && current.expiresAt > Date.now()
      ? current.accessToken
      : null;
  }

  async refreshToken(): Promise<Result<StoredTokens, AuthError>> {
    const refreshToken = await this.storage.get<string>("refreshToken");
    if (!refreshToken) {
      return new Err(
        new AuthError("not_authenticated", "No refresh token found.")
      );
    }

    const cellInfo = await this.getCellInfoFromStorage();
    if (!cellInfo) {
      return new Err(
        new AuthError("invalid_oauth_token_error", "No cell info found.")
      );
    }

    const tokensRes = await postWorkOSAuthenticate(cellInfo.url, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (tokensRes.isOk()) {
      return new Ok(await this.saveTokens(tokensRes.value));
    }

    const { status, type, message } = tokensRes.error;
    if (status === 400 && type === "invalid_grant") {
      // Do not clear new tokens that another task pane saved during this refresh.
      const storedRefreshToken = await this.storage.get<string>("refreshToken");
      if (storedRefreshToken === refreshToken) {
        await this.clearStoredData();
      }
      return new Err(
        new AuthError(
          "expired_oauth_token_error",
          "Session expired. Please sign in again."
        )
      );
    }

    logger.warn(
      { httpStatus: status, errorType: type },
      "Token refresh failed. The tokens are kept for the next try."
    );
    return new Err(
      new AuthError(
        "invalid_oauth_token_error",
        `Token refresh failed: ${message}`
      )
    );
  }
}
