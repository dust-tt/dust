import { useState, useEffect, useCallback } from "react";
import type { StoredUser } from "../types";
import {
  initiateLogin,
  fetchUserAndWorkspaces,
  getAccessToken,
  logout as authLogout,
  checkSSOEnforcement,
} from "../services/auth";
import { secureStorage, appStorage } from "../services/storage";
import type { WorkspaceType } from "@dust-tt/client";

export function useAuth() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Load persisted auth state on mount
  useEffect(() => {
    (async () => {
      const storedUser = appStorage.getUser();
      const tokens = await secureStorage.getTokens();

      if (storedUser && tokens) {
        setUser(storedUser);
        setIsAuthenticated(true);

        // Proactively refresh if near expiry
        if (tokens.expiresAt < Date.now() + 60_000) {
          await getAccessToken();
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const handleLogin = useCallback(async (organizationId?: string) => {
    setAuthError(null);
    try {
      const tokens = await initiateLogin(organizationId);
      if (!tokens) {
        setAuthError("Login was cancelled or failed.");
        return;
      }

      const fetchedUser = await fetchUserAndWorkspaces(tokens.accessToken);
      if (!fetchedUser) {
        setAuthError("Failed to fetch user information.");
        return;
      }

      setUser(fetchedUser);
      setIsAuthenticated(true);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Login failed.");
    }
  }, []);

  const handleSelectWorkspace = useCallback(
    (workspace: WorkspaceType) => {
      if (!user) return;

      // Check SSO enforcement
      if (!checkSSOEnforcement(user, workspace.sId)) {
        // Re-trigger login with SSO organization_id
        handleLogin(`workspace-${workspace.sId}`);
        return;
      }

      const updatedUser: StoredUser = {
        ...user,
        selectedWorkspace: workspace.sId,
      };
      setUser(updatedUser);
      appStorage.setUser(updatedUser);
    },
    [user, handleLogin]
  );

  const handleLogout = useCallback(async () => {
    await authLogout();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  return {
    user,
    isAuthenticated,
    isLoading,
    authError,
    handleLogin,
    handleLogout,
    handleSelectWorkspace,
    selectedWorkspace: user?.workspaces.find(
      (w) => w.sId === user.selectedWorkspace
    ),
  };
}
