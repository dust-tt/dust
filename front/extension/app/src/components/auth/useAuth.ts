import { login, logout, refreshToken } from "@app/extension/app/src/lib/auth";
import type {
  StoredTokens,
  StoredUser,
} from "@app/extension/app/src/lib/storage";
import {
  getStoredTokens,
  getStoredUser,
  saveSelectedWorkspace,
} from "@app/extension/app/src/lib/storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const log = console.error;

export const useAuthHook = () => {
  const [tokens, setTokens] = useState<StoredTokens | null>(null);
  const isAuthenticated = useMemo(
    () => !!(tokens?.accessToken && tokens.expiresAt > Date.now()),
    [tokens]
  );

  const [user, setUser] = useState<StoredUser | null>(null);
  const isUserSetup = !!(user && user.userId && user.selectedWorkspace);
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
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    setIsLoading(false);
  }, []);

  const handleRefreshToken = useCallback(async () => {
    const savedTokens = await refreshToken();
    if (!savedTokens) {
      log("Refresh token: No access token received.");
      await handleLogout();
      return;
    }
    setTokens(savedTokens);
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

  const handleLogin = useCallback(async () => {
    setIsLoading(true);

    const response = await login();
    if (!response) {
      // TODO(EXT): User facing error message if login failed.
      setIsLoading(false);
      return;
    }
    setTokens(response.tokens);
    scheduleTokenRefresh(response.tokens.expiresAt);
    setUser(response.user);
    setIsLoading(false);
  }, [scheduleTokenRefresh]);

  const handleSelectWorkspace = async (workspaceId: string) => {
    const updatedUser = await saveSelectedWorkspace(workspaceId);
    setUser(updatedUser);
  };

  return {
    token: tokens?.accessToken ?? null,
    isAuthenticated,
    user,
    workspace: user?.workspaces.find((w) => w.sId === user.selectedWorkspace),
    isUserSetup,
    isLoading,
    handleLogin,
    handleLogout,
    handleSelectWorkspace,
  };
};
