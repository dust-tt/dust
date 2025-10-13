import { usePlatform } from "@app/shared/context/PlatformContext";
import type { StoredTokens, StoredUser } from "@app/shared/services/auth";
import {
  AuthError,
  isValidEnterpriseConnection,
  makeEnterpriseConnectionName,
} from "@app/shared/services/auth";
import type { WorkspaceType } from "@dust-tt/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PROACTIVE_REFRESH_WINDOW_MS = 1000 * 60; // 1 minute
const log = console.error;

export const useAuthHook = () => {
  const platform = usePlatform();

  const [tokens, setTokens] = useState<StoredTokens | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [forcedConnection, setForcedConnection] = useState<
    string | undefined
  >();

  const isAuthenticated = useMemo(
    () =>
      !!(
        tokens?.accessToken &&
        tokens.expiresAt > Date.now() &&
        user?.dustDomain
      ),
    [tokens, user]
  );

  const isUserSetup = !!(user && user.sId && user.selectedWorkspace);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    const success = await platform.auth.logout();
    if (!success) {
      // TODO(EXT): User facing error message if logout failed.
      setIsLoading(false);
      return;
    }
    setTokens(null);
    setAuthError(null);
    setForcedConnection(undefined);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    setIsLoading(false);
  }, []);

  const handleRefreshToken = useCallback(async () => {
    // Call getAccessToken, it will refresh the token if needed.
    const newAccessToken = await platform.auth.getAccessToken(true);
    if (!newAccessToken) {
      setAuthError(
        new AuthError("not_authenticated", "No access token received.")
      );
      log("Refresh token: No access token received.");
      return;
    }

    const storedTokens = await platform.auth.getStoredTokens();
    setTokens((prev) => {
      if (!prev) {
        return null;
      }

      return {
        ...prev,
        ...storedTokens,
      };
    });
    setAuthError(null);
  }, []);

  // Listen for changes in storage to make sure we always have the latest user and tokens.
  useEffect(() => {
    const unsub = platform.storage.onChanged((changes) => {
      if ("accessToken" in changes && !changes.accessToken) {
        log("Access token removed from storage.");
        setTokens(null);
        setUser(null);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);

      // Fetch tokens & user from storage.
      const storedTokens = await platform.auth.getStoredTokens();
      const savedUser = await platform.auth.getStoredUser();

      if (!storedTokens || !savedUser) {
        // TODO(EXT): User facing error message if no tokens found.
        setIsLoading(false);
        return;
      }
      setTokens(storedTokens);
      setUser(savedUser);

      // Token refresh.
      if (storedTokens.expiresAt < Date.now() + PROACTIVE_REFRESH_WINDOW_MS) {
        await handleRefreshToken();
      }

      setIsLoading(false);
    })();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const workspace = useMemo(
    () => user?.workspaces.find((w) => w.sId === user.selectedWorkspace),
    [user]
  );

  const redirectToSSOLogin = useCallback(
    async (workspace: WorkspaceType) => {
      log("Enforcing SSO for", workspace);
      setAuthError(
        new AuthError(
          "sso_enforced",
          "Access requires Single Sign-On (SSO) authentication. Use your SSO provider to sign in."
        )
      );
      setForcedConnection(makeEnterpriseConnectionName(workspace.sId));
      await platform.auth.logout();
    },
    [setAuthError, setForcedConnection]
  );

  const handleSelectWorkspace = async (workspace: WorkspaceType) => {
    const updatedUser = await platform.saveSelectedWorkspace({
      workspaceId: workspace.sId,
    });
    if (!isValidEnterpriseConnection(updatedUser, workspace)) {
      return;
    }

    setUser(updatedUser);
  };

  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    const response = await platform.auth.login({
      forcedConnection,
    });
    if (response.isErr()) {
      setAuthError(response.error);
      setIsLoading(false);
      void platform.clearStoredData();
      return;
    }

    const { tokens, user } = response.value;

    if (user.selectedWorkspace) {
      const selectedWorkspace = user.workspaces.find(
        (w) => w.sId === user.selectedWorkspace
      );
      if (
        selectedWorkspace &&
        !isValidEnterpriseConnection(user, selectedWorkspace)
      ) {
        await redirectToSSOLogin(selectedWorkspace);
        setIsLoading(false);
        return;
      }
    }

    setTokens(tokens);
    setAuthError(null);
    setUser(user);
    setIsLoading(false);
  }, [forcedConnection]);

  return {
    token: tokens?.accessToken ?? null,
    isAuthenticated,
    setAuthError,
    authError,
    redirectToSSOLogin,
    user,
    workspace,
    isUserSetup,
    isLoading,
    handleLogin,
    handleLogout,
    handleSelectWorkspace,
  };
};
