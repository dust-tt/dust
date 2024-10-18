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

  // User is authenticated if we have a valid access token.
  const isTokenValid = useCallback(() => {
    return !!(tokens?.accessToken && tokens.expiresAt > Date.now());
  }, [tokens]);
  const isAuthenticated = useMemo(() => isTokenValid(), [isTokenValid]);

  // Schedule a token refresh before the current token expires.
  const scheduleTokenRefresh = useCallback((expiresAt: number) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    const refreshTime = Math.max(expiresAt - Date.now() - 60000, 0);
    refreshTimerRef.current = setTimeout(handleRefreshToken, refreshTime);
  }, []);

  // Send a refresh token message to the background script to get a new access token.
  const handleRefreshToken = useCallback(async () => {
    if (!tokens?.refreshToken) {
      return;
    }
    try {
      const response = await sendRefreshTokenMessage(tokens.refreshToken);
      if (!response) {
        log("Refresh token: empty response from background.");
      }
      const savedTokens = await saveTokens(response);
      setTokens(savedTokens);
      scheduleTokenRefresh(savedTokens.expiresAt);
    } catch (error) {
      log("Refresh token: unknown error.", error);
      await handleLogout();
    }
  }, [tokens, scheduleTokenRefresh]);

  // On mount, check if we have stored tokens and if they are still valid.
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const storedTokens = await getStoredTokens();
        if (!storedTokens) {
          setIsLoading(false);
          return;
        }
        setTokens(storedTokens);
        if (storedTokens.expiresAt > Date.now()) {
          scheduleTokenRefresh(storedTokens.expiresAt);
        } else {
          await handleRefreshToken();
        }
      } catch (error) {
        log("Unknown error retrieving tokens.", error);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchTokens();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [handleRefreshToken, scheduleTokenRefresh]);

  // Send an auth message to the background script to start the authentication flow.
  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sendAuthMessage();
      if (!response.accessToken) {
        log("Login failed: No access token received.");
        return;
      }
      const savedTokens = await saveTokens(response);
      setTokens(savedTokens);
      scheduleTokenRefresh(savedTokens.expiresAt);
    } catch (error) {
      log("Login failed: Unknown error.", error);
    } finally {
      setIsLoading(false);
    }
  }, [scheduleTokenRefresh]);

  // Send a logout message to the background script to clear the stored tokens.
  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sentLogoutMessage();
      if (!response || !response.success === true) {
        log("Logout failed: No success response received.");
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

  return {
    token: tokens?.accessToken ?? null,
    isLoading,
    isAuthenticated,
    handleLogin,
    handleLogout,
  };
};
