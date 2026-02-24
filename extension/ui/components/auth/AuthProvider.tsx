import { AuthContext } from "@app/lib/auth/AuthContext";
import type { SubscriptionType } from "@app/types/plan";
import type { ExtensionWorkspaceType, WorkspaceType } from "@app/types/user";
import { isAdmin, isBuilder } from "@app/types/user";
import type { AuthError, StoredUser } from "@extension/shared/services/auth";
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
  user: StoredUser | null;
  workspace: ExtensionWorkspaceType | undefined;
  isUserSetup: boolean;
  isLoading: boolean;
  handleLogin: () => void;
  handleLogout: () => void;
  handleSelectWorkspace: (workspace: WorkspaceType) => void;
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

// Stub subscription for shared front components — none of them use subscription
// in the extension context.
const EXTENSION_SUBSCRIPTION: SubscriptionType = {
  sId: null,
  status: "active",
  trialing: false,
  stripeSubscriptionId: null,
  startDate: null,
  endDate: null,
  paymentFailingSince: null,
  plan: {
    code: "EXTENSION",
    name: "Extension",
    limits: {
      assistant: {
        isSlackBotAllowed: false,
        maxMessages: -1,
        maxMessagesTimeframe: "lifetime",
        isDeepDiveAllowed: false,
      },
      connections: {
        isConfluenceAllowed: false,
        isSlackAllowed: false,
        isNotionAllowed: false,
        isGoogleDriveAllowed: false,
        isGithubAllowed: false,
        isIntercomAllowed: false,
        isWebCrawlerAllowed: false,
        isSalesforceAllowed: false,
      },
      dataSources: {
        count: -1,
        documents: { count: -1, sizeMb: -1 },
      },
      users: { maxUsers: -1, isSSOAllowed: false, isSCIMAllowed: false },
      vaults: { maxVaults: -1 },
      capabilities: { images: { maxImagesPerWeek: -1 } },
      canUseProduct: true,
    },
    trialPeriodDays: 0,
  },
  requestCancelAt: null,
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
    handleSelectWorkspace,
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
      isUserSetup,
      isLoading,
      handleLogin,
      handleLogout,
      handleSelectWorkspace,
    }),
    [
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
      handleSelectWorkspace,
    ]
  );

  const frontAuthValue = useMemo(() => {
    if (!user || !workspace) {
      return null;
    }
    return {
      user,
      workspace,
      subscription: EXTENSION_SUBSCRIPTION,
      isAdmin: isAdmin(workspace),
      isBuilder: isBuilder(workspace),
      featureFlags: [],
      vizUrl: "",
    };
  }, [user, workspace]);

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
