import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StoredTokens } from "../lib/auth";
import {
  clearStoredTokens,
  getStoredTokens,
  saveTokens,
  sendAuthMessage,
  sendRefreshTokenMessage,
  sentLogoutMessage,
} from "../lib/auth";

const log = console.error;

export const useAuthHook = () => {
  const [tokens, setTokens] = useState<StoredTokens | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isAuthenticated = useMemo(
    () => !!(tokens?.accessToken && tokens.expiresAt > Date.now()),
    [tokens]
  );

  // Logout sends a message to the background script to call the auth0 logout endpoint.
  // It also clears the stored tokens in the extension.
  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sentLogoutMessage();
      if (!response?.success) {
        log("Logout failed: No success response received.");
        return;
      }
      await clearStoredTokens();
      setTokens(null);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    } catch (error) {
      log("Logout failed: Unknown error.", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh token sends a message to the background script to call the auth0 refresh token endpoint.
  // It updates the stored tokens with the new access token.
  // If the refresh token is invalid, it will call handleLogout.
  const handleRefreshToken = useCallback(async () => {
    if (!tokens?.refreshToken) {
      return;
    }
    try {
      const response = await sendRefreshTokenMessage(tokens.refreshToken);
      if (!response?.accessToken) {
        log("Refresh token: No access token received.");
        await handleLogout();
        return;
      }
      const savedTokens = await saveTokens(response);
      setTokens(savedTokens);
    } catch (error) {
      log("Refresh token: unknown error.", error);
      await handleLogout();
    }
  }, [tokens, handleLogout]);

  // Schedule token refresh sets a timeout to call handleRefreshToken before the token expires.
  const scheduleTokenRefresh = useCallback(
    (expiresAt: number) => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      const refreshTime = Math.max(expiresAt - Date.now() - 60000, 0);
      refreshTimerRef.current = setTimeout(handleRefreshToken, refreshTime);
    },
    [handleRefreshToken]
  );

  // Initialize auth checks if there are stored tokens and if they are still valid.
  // It is called on component mount.
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedTokens = await getStoredTokens();
        if (storedTokens) {
          setTokens(storedTokens);
          if (storedTokens.expiresAt > Date.now()) {
            scheduleTokenRefresh(storedTokens.expiresAt);
          } else {
            await handleRefreshToken();
          }
        }
      } catch (error) {
        log("Unknown error retrieving tokens.", error);
      } finally {
        setIsLoading(false);
      }
    };
    void initializeAuth();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [handleRefreshToken, scheduleTokenRefresh]);

  // Login sends a message to the background script to call the auth0 login endpoint.
  // It saves the tokens in the extension and schedules a token refresh.
  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sendAuthMessage();
      if (response.accessToken) {
        const savedTokens = await saveTokens(response);
        setTokens(savedTokens);
        scheduleTokenRefresh(savedTokens.expiresAt);
      } else {
        log("Login failed: No access token received.");
      }
    } catch (error) {
      log("Login failed: Unknown error.", error);
    } finally {
      setIsLoading(false);
    }
  }, [scheduleTokenRefresh]);

  return {
    token: tokens?.accessToken ?? null,
    isLoading,
    isAuthenticated,
    handleLogin,
    handleLogout,
  };
};
