import { useRegionContext } from "@app/lib/auth/RegionContext";
import { clientFetch } from "@app/lib/egress/client";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import type { WorkspaceType } from "@dust-tt/client";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import type {
  ConnectionDetails,
  StoredTokens,
} from "@extension/shared/services/auth";
import {
  AuthError,
  isValidEnterpriseConnection,
  makeEnterpriseConnectionName,
} from "@extension/shared/services/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PROACTIVE_REFRESH_WINDOW_MS = 1000 * 60; // 1 minute
const log = console.error;

export const useAuthHook = () => {
  const platform = usePlatform();

  const [tokens, setTokens] = useState<StoredTokens | null>(null);
  const [connectionDetails, setConnectionDetails] =
    useState<ConnectionDetails | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(
    null
  );
  const [user, setUser] = useState<UserTypeWithWorkspaces | null>(null);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [forcedConnection, setForcedConnection] = useState<
    string | undefined
  >();
  const [featureFlags, setFeatureFlags] = useState<WhitelistableFeature[]>([]);
  const { setRegionInfo } = useRegionContext();

  const isAuthenticated = useMemo(
    () => !!(tokens?.accessToken && tokens.expiresAt > Date.now()),
    [tokens]
  );

  const isUserSetup = !!(user && user.sId && selectedWorkspace);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUserLoading, setIsUserLoading] = useState<boolean>(false);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Derive workspace from user workspaces + selectedWorkspace
  const workspace = useMemo(
    () => user?.workspaces.find((w) => w.sId === selectedWorkspace),
    [user, selectedWorkspace]
  );

  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    const success = await platform.auth.logout();
    if (!success) {
      setIsLoading(false);
      return;
    }
    setTokens(null);
    setConnectionDetails(null);
    setSelectedWorkspace(null);
    setUser(null);
    setAuthError(null);
    setForcedConnection(undefined);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    setIsLoading(false);
  }, []);

  const handleRefreshToken = useCallback(async () => {
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

  // Listen for changes in storage to make sure we always have the latest tokens.
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

  // Fetch user data from /api/user when authenticated.
  useEffect(() => {
    if (!isAuthenticated || !tokens?.accessToken) {
      return;
    }

    setIsUserLoading(true);
    void (async () => {
      try {
        const res = await clientFetch("/api/user", {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
          credentials: "omit", // Ensure cookies are not sent with requests from the extension
        });
        if (res.ok) {
          const data = await res.json();
          const fetchedUser = data.user as UserTypeWithWorkspaces;
          setUser(fetchedUser);

          // If user has a selectedWorkspace from the server (org-scoped login),
          // and we don't have one stored, use it.
          if (!selectedWorkspace && fetchedUser.selectedWorkspace) {
            setSelectedWorkspace(fetchedUser.selectedWorkspace);
            await platform.storage.set(
              "selectedWorkspace",
              fetchedUser.selectedWorkspace
            );
          }
        }
      } finally {
        setIsUserLoading(false);
      }
    })();
  }, [isAuthenticated, tokens?.accessToken]);

  // Initialize from storage on mount.
  // RegionContext already restores region info from localStorage, so we only
  // need to restore tokens, connection details, and selected workspace here.
  useEffect(() => {
    void (async () => {
      setIsLoading(true);

      const storedTokens = await platform.auth.getStoredTokens();
      const storedConnectionDetails =
        await platform.auth.getConnectionDetailsFromStorage();
      const storedSelectedWorkspace =
        await platform.auth.getSelectedWorkspace();

      if (!storedTokens) {
        setIsLoading(false);
        return;
      }
      setTokens(storedTokens);
      setConnectionDetails(storedConnectionDetails);
      setSelectedWorkspace(storedSelectedWorkspace);

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

  // Fetch feature flags when workspace is ready.
  useEffect(() => {
    if (!isAuthenticated || !workspace || !tokens?.accessToken) {
      setFeatureFlags([]);
      return;
    }

    void (async () => {
      const res = await clientFetch(`/api/w/${workspace.sId}/feature-flags`, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          credentials: "omit", // Ensure cookies are not sent with requests from the extension
        },
      });
      if (res.ok) {
        const { feature_flags } = await res.json();
        setFeatureFlags(feature_flags ?? []);
      } else {
        setFeatureFlags([]);
      }
    })();
  }, [workspace, tokens?.accessToken, isAuthenticated]);

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
    await platform.storage.set("selectedWorkspace", workspace.sId);
    setSelectedWorkspace(workspace.sId);

    if (
      connectionDetails &&
      !isValidEnterpriseConnection(connectionDetails, workspace)
    ) {
      await redirectToSSOLogin(workspace);
    }
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

    const {
      tokens: newTokens,
      regionInfo: newRegionInfo,
      connectionDetails: newConnectionDetails,
    } = response.value;

    // Restore selectedWorkspace from storage if available.
    const storedSelectedWorkspace = await platform.auth.getSelectedWorkspace();

    if (storedSelectedWorkspace && user) {
      const selectedWs = user.workspaces.find(
        (w) => w.sId === storedSelectedWorkspace
      );
      if (
        selectedWs &&
        !isValidEnterpriseConnection(newConnectionDetails, selectedWs)
      ) {
        await redirectToSSOLogin(selectedWs);
        setIsLoading(false);
        return;
      }
    }

    setTokens(newTokens);
    setRegionInfo(newRegionInfo);
    setConnectionDetails(newConnectionDetails);
    setAuthError(null);
    setIsLoading(false);
  }, [forcedConnection, user]);

  return {
    token: tokens?.accessToken ?? null,
    isAuthenticated,
    setAuthError,
    authError,
    redirectToSSOLogin,
    user,
    workspace,
    isUserSetup,
    isLoading: isLoading || isUserLoading,
    handleLogin,
    handleLogout,
    handleSelectWorkspace,
    featureFlags,
  };
};
