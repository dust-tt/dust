import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { useAuth } from "@extension/components/auth/AuthProvider";
import {
  sendAuthMessage,
  sendRefreshTokenMessage,
  sentLogoutMessage,
} from "@extension/lib/messages";
import type {
  StoredTokens,
  StoredUser,
  UserTypeWithWorkspaces,
} from "@extension/lib/storage";
import {
  clearStoredData,
  getStoredTokens,
  saveTokens,
  saveUser,
} from "@extension/lib/storage";
import { useEffect } from "react";

const log = console.error;

type AuthErrorCode = "user_not_found" | "not_authenticated";

export class AuthError extends Error {
  readonly type = "AuthError";
  constructor(
    readonly code: AuthErrorCode,
    msg?: string
  ) {
    super(msg);
  }
}

// Login sends a message to the background script to call the auth0 login endpoint.
// It saves the tokens in the extension and schedules a token refresh.
// Then it calls the /me route to get the user info.
export const login = async (
  forceLogin?: boolean
): Promise<Result<{ tokens: StoredTokens; user: StoredUser }, AuthError>> => {
  try {
    const response = await sendAuthMessage(forceLogin);
    if (!response.accessToken) {
      throw new Error("No access token received.");
    }
    const tokens = await saveTokens(response);
    const res = await fetchMe(tokens.accessToken);
    if (res.isErr()) {
      return res;
    }

    const user = await saveUser(res.value.user);
    return new Ok({ tokens, user });
  } catch (error) {
    return new Err(new AuthError("not_authenticated", error?.toString()));
  }
};

// Logout sends a message to the background script to call the auth0 logout endpoint.
// It also clears the stored tokens in the extension.
export const logout = async (): Promise<boolean> => {
  try {
    const response = await sentLogoutMessage();
    if (!response?.success) {
      throw new Error("No success response received.");
    }
    return true;
  } catch (error) {
    log("Logout failed: Unknown error.", error);
    return false;
  } finally {
    await clearStoredData();
  }
};

// Refresh token sends a message to the background script to call the auth0 refresh token endpoint.
// It updates the stored tokens with the new access token.
// If the refresh token is invalid, it will call handleLogout.
export const refreshToken = async (): Promise<
  Result<StoredTokens, AuthError>
> => {
  try {
    const tokens = await getStoredTokens();
    if (!tokens) {
      return new Err(new AuthError("not_authenticated", "No tokens found."));
    }
    const response = await sendRefreshTokenMessage(tokens.refreshToken);
    if (!response?.accessToken) {
      return new Err(
        new AuthError("not_authenticated", "No access token received")
      );
    }
    return new Ok(await saveTokens(response));
  } catch (error) {
    log("Refresh token: unknown error.", error);
    await logout();
    return new Err(new AuthError("not_authenticated", error?.toString()));
  }
};

// Fetch me sends a request to the /me route to get the user info.
const fetchMe = async (
  token: string
): Promise<Result<{ user: UserTypeWithWorkspaces }, AuthError>> => {
  const response = await fetch(`${process.env.DUST_DOMAIN}/api/v1/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const me = await response.json();
  if (!response.ok) {
    return new Err(new AuthError(me.error.type, me.error.message));
  }
  return new Ok(me);
};

export const useAuthErrorCheck = (error: any) => {
  const { setAuthError } = useAuth();
  useEffect(() => {
    if (error?.type === "not_authenticated") {
      setAuthError(error);
      void logout();
    }
  }, [error]);
};
