import type { AuthError } from "@extension/lib/auth";
import { login, logout, refreshToken } from "@extension/lib/auth";
import type { StoredTokens, StoredUser } from "@extension/lib/storage";
import {
  clearStoredData,
  getStoredTokens,
  getStoredUser,
  saveSelectedWorkspace,
} from "@extension/lib/storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const log = console.error;

export const useAuthHook = () => {
  const [tokens, setTokens] = useState<StoredTokens | null>(null);
  const isAuthenticated = useMemo(
    () => !!(tokens?.accessToken && tokens.expiresAt > Date.now()),
    [tokens]
  );
  const [user, setUser] = useState<StoredUser | null>(null);
  const [authError, setAuthError] = useState<AuthError | null>(null);

  const isUserSetup = !!(user && user.sId && user.selectedWorkspace);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    const success = await logout();
    if (!success) {
      // TODO(EXT): User facing error message if logout failed.
      setIsLoading(false);
      return;
    }
    setTokens(null);
    setAuthError(null);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    setIsLoading(false);
  }, []);

  const handleRefreshToken = useCallback(async () => {
    const savedTokens = await refreshToken();
    if (savedTokens.isErr()) {
      setAuthError(savedTokens.error);
      log("Refresh token: No access token received.");
      return;
    }
    setTokens(savedTokens.value);
    setAuthError(null);
    scheduleTokenRefresh(savedTokens.value.expiresAt);
  }, [handleLogout]);

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

  // Listen for changes in storage to make sure we always have the latest user and tokens.
  useEffect(() => {
    const handleStorageChange = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes.accessToken && !changes.accessToken.newValue) {
        console.log("Access token removed from storage.");
        setTokens(null);
        setUser(null);
      }
    };
    chrome.storage.local.onChanged.addListener(handleStorageChange);
    return () =>
      chrome.storage.local.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);

      // Fetch tokens & user from storage.
      const storedTokens = await getStoredTokens();
      const savedUser = await getStoredUser();

      if (!storedTokens || !savedUser) {
        // TODO(EXT): User facing error message if no tokens found.
        setIsLoading(false);
        return;
      }
      setTokens(storedTokens);
      setUser(savedUser);

      //  Token refresh.
      if (storedTokens.expiresAt > Date.now()) {
        scheduleTokenRefresh(storedTokens.expiresAt);
      } else {
        await handleRefreshToken();
      }

      setIsLoading(false);
    })();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [handleRefreshToken, scheduleTokenRefresh]);

  const handleLogin = useCallback(
    async (isForceLogin?: boolean) => {
      setIsLoading(true);

      const response = await login(isForceLogin);
      if (response.isErr()) {
        setAuthError(response.error);
        setIsLoading(false);
        void clearStoredData();
        return;
      }

      const { tokens, user } = response.value;
      setTokens(tokens);
      setAuthError(null);
      scheduleTokenRefresh(tokens.expiresAt);
      setUser(user);
      setIsLoading(false);
    },
    [scheduleTokenRefresh]
  );

  const handleSelectWorkspace = async (workspaceId: string) => {
    const updatedUser = await saveSelectedWorkspace(workspaceId);
    setUser(updatedUser);
  };

  return {
    token: tokens?.accessToken ?? null,
    isAuthenticated,
    setAuthError,
    authError,
    user,
    workspace: user?.workspaces.find((w) => w.sId === user.selectedWorkspace),
    isUserSetup,
    isLoading,
    handleLogin,
    handleLogout,
    handleSelectWorkspace,
  };
};
