import { setDefaultInitResolver } from "@app/lib/api/config";
import { useRegionContext } from "@app/lib/auth/RegionContext";
import { clientFetch } from "@app/lib/egress/client";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import type { WorkspaceType } from "@dust-tt/client";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import type { StoredTokens } from "@extension/shared/services/auth";
import {
  AuthError,
  makeEnterpriseConnectionName,
} from "@extension/shared/services/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PROACTIVE_REFRESH_WINDOW_MS = 1000 * 60; // 1 minute
const log = console.error;

export const useAuthHook = () => {
  const platform = usePlatform();

  const [tokens, setTokens] = useState<StoredTokens | null>(null);
  const [user, setUser] = useState<UserTypeWithWorkspaces | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceType | undefined>();
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [forcedConnection, setForcedConnection] = useState<
    string | undefined
  >();
  const [featureFlags, setFeatureFlags] = useState<WhitelistableFeature[]>([]);
  const { setRegionInfo } = useRegionContext();

  // Set default fetch init for the extension (overrides RegionContext's credentials: "include").
  // Must be declared before any fetch effects so it's active when they run.
  useEffect(() => {
    if (tokens?.accessToken) {
      setDefaultInitResolver(() => ({
        credentials: "omit",
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      }));
    } else {
      setDefaultInitResolver(() => ({
        credentials: "omit",
      }));
    }

    return () => {
      setDefaultInitResolver(null);
    };
  }, [tokens?.accessToken]);

  const isAuthenticated = useMemo(
    () => !!(tokens?.accessToken && tokens.expiresAt > Date.now()),
    [tokens]
  );

  const isUserSetup = !!(user && user.sId && workspace);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    const success = await platform.auth.logout();
    if (!success) {
      setIsLoading(false);
      return;
    }
    setTokens(null);
    setWorkspace(undefined);
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

    void (async () => {
      try {
        const res = await clientFetch("/api/user");
        if (res.ok) {
          const data = await res.json();
          const fetchedUser = data.user as UserTypeWithWorkspaces;
          setUser(fetchedUser);

          const ws = fetchedUser.selectedWorkspace
            ? fetchedUser.workspaces.find(
                (w) => w.sId === fetchedUser.selectedWorkspace
              )
            : fetchedUser.workspaces[0];
          setWorkspace(ws);
          if (ws) {
            await platform.storage.set("selectedWorkspace", ws.sId);
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isAuthenticated, tokens?.accessToken]);

  // Initialize from storage on mount.
  // RegionContext already restores region info from localStorage, so we only
  // need to restore tokens here.
  useEffect(() => {
    void (async () => {
      const storedTokens = await platform.auth.getStoredTokens();

      if (!storedTokens) {
        setIsLoading(false);
        return;
      }
      setTokens(storedTokens);

      // Token refresh.
      if (storedTokens.expiresAt < Date.now() + PROACTIVE_REFRESH_WINDOW_MS) {
        await handleRefreshToken();
      }

      // isLoading stays true — the user fetch effect will clear it.
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
      const res = await clientFetch(`/api/w/${workspace.sId}/feature-flags`);
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

  const handleLogin = useCallback(
    async (args?: { organizationId?: string }) => {
      setIsLoading(true);
      const response = await platform.auth.login({
        forcedConnection,
        organizationId: args?.organizationId,
      });
      if (response.isErr()) {
        setAuthError(response.error);
        setIsLoading(false);
        void platform.clearStoredData();
        return;
      }

      const { tokens: newTokens, regionInfo: newRegionInfo } = response.value;

      setTokens(newTokens);
      setRegionInfo(newRegionInfo, { keepInStorage: true });
      setAuthError(null);
      // isLoading stays true — the user fetch effect will clear it.
    },
    [forcedConnection]
  );

  const handleSelectOrganization = useCallback(
    async (organizationId: string) => {
      await handleLogin({ organizationId });
    },
    [handleLogin]
  );

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
    handleSelectOrganization,
    featureFlags,
  };
};
