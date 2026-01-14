import { Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ComponentType, ReactNode } from "react";
import { createContext, useContext, useEffect } from "react";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  LightWorkspaceType,
  SubscriptionType,
  UserType,
} from "@app/types";
import { isString } from "@app/types";

interface AuthContextValue {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  isBuilder: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  workspaceId: string;
}

function AuthProvider({ children, workspaceId }: AuthProviderProps) {
  const { data, isLoading } = useSWRWithDefaults<
    string,
    AuthContextValue | { user: null }
  >(`/api/w/${workspaceId}/auth-context`, fetcher);

  useEffect(() => {
    if (!isLoading && (!data || !("user" in data) || !data.user)) {
      window.location.href = `/api/workos/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  }, [isLoading, data]);

  if (isLoading || !data || !("user" in data) || !data.user) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={data as AuthContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function withAuth<P extends object>(Component: ComponentType<P>) {
  const displayName = Component.displayName ?? Component.name ?? "Component";

  function WithAuth(props: P) {
    const router = useRouter();
    const { wId } = router.query;

    if (!isString(wId)) {
      return (
        <div className="flex h-screen w-full items-center justify-center">
          <Spinner size="xl" />
        </div>
      );
    }

    return (
      <AuthProvider workspaceId={wId}>
        <Component {...props} />
      </AuthProvider>
    );
  }

  WithAuth.displayName = `withAuth(${displayName})`;

  return WithAuth;
}
