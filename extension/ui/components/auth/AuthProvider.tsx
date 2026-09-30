import { AuthContext, type AuthContextValue } from "@app/lib/auth/AuthContext";
import { emptyWorkspacePermissions } from "@app/types/group_permissions";
import type { SubscriptionType } from "@app/types/plan";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";
import { isAdmin, isManager } from "@app/types/user";
import type { AuthError } from "@extension/shared/services/auth";
import { useAuthHook } from "@extension/ui/components/auth/useAuth";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

// Extension-specific auth context (bearer token, login/logout, etc.)
type ExtensionAuthContextType = {
  token: string | null;
  isAuthenticated: boolean;
  authError: AuthError | null;
  setAuthError: (error: AuthError | null) => void;
  redirectToSSOLogin: (workspace: WorkspaceType) => void;
  user: UserTypeWithWorkspaces | null;
  workspace: WorkspaceType | undefined;
  subscription: SubscriptionType | null;
  isUserSetup: boolean;
  isLoading: boolean;
  handleLogin: (args?: { organizationId?: string }) => void;
  handleLogout: () => void;
  handleSelectOrganization: (organizationId: string) => void;
};

const ExtensionAuthContext = createContext<ExtensionAuthContextType | null>(
  null
);

export const useExtensionAuth = () => {
  const context = useContext(ExtensionAuthContext);
  if (!context) {
    throw new Error(
      "useExtensionAuth must be used within an ExtensionAuthProvider"
    );
  }
  return context;
};

interface ExtensionAuthProviderProps {
  children: ReactNode;
}

/**
 * Single auth provider for the extension. It:
 * - Manages extension-specific auth state (bearer token, login/logout flows) via
 *   ExtensionAuthContext — consumed with useExtensionAuth().
 * - Bridges to the front's AuthContext so that shared front components (e.g.
 *   ConversationViewer sub-components) can call useAuth() without error.
 * - Uses CellContext for URL resolution (dustDomain).
 *
 * Mirrors the ExtensionFetcherProvider / FetcherProvider pattern.
 */
export function ExtensionAuthProvider({
  children,
}: ExtensionAuthProviderProps) {
  const {
    token,
    isAuthenticated,
    authError,
    setAuthError,
    redirectToSSOLogin,
    user,
    workspace,
    isUserSetup,
    isLoading,
    handleLogin,
    handleLogout,
    handleSelectOrganization,
    featureFlags,
    subscription,
  } = useAuthHook();

  const extensionAuthValue = useMemo(
    () => ({
      token,
      isAuthenticated,
      authError,
      setAuthError,
      redirectToSSOLogin,
      user,
      workspace,
      subscription,
      isUserSetup,
      isLoading,
      handleLogin,
      handleLogout,
      handleSelectOrganization,
    }),
    [
      token,
      isAuthenticated,
      authError,
      setAuthError,
      redirectToSSOLogin,
      user,
      workspace,
      subscription,
      isUserSetup,
      isLoading,
      handleLogin,
      handleLogout,
      handleSelectOrganization,
    ]
  );

  // Hold off on AuthContext until subscription is loaded — the model picker
  // gates premium models on plan access (`hasAdvancedModelAccess` /
  // credit-priced) and a stub would incorrectly lock them.
  const frontAuthValue: AuthContextValue | null = useMemo(() => {
    if (!user || !workspace || !subscription) {
      return null;
    }
    return {
      user,
      workspace,
      subscription,
      isAdmin: isAdmin(workspace),
      isManager: isManager(workspace),
      featureFlags,
      vizUrl: process.env.VIZ_PUBLIC_URL ?? "",
      providersHealth: null,
      workspacePermissions: emptyWorkspacePermissions(),
    };
  }, [user, workspace, subscription, featureFlags]);

  return (
    <ExtensionAuthContext.Provider value={extensionAuthValue}>
      {frontAuthValue ? (
        <AuthContext.Provider value={frontAuthValue}>
          {children}
        </AuthContext.Provider>
      ) : (
        children
      )}
    </ExtensionAuthContext.Provider>
  );
}
