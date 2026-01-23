import { Spinner } from "@dust-tt/sparkle";
import type { ComponentType, ReactNode } from "react";
import { useEffect } from "react";

import { useAppRouter } from "@app/lib/platform";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { isString } from "@app/types";

import type { AuthContextValue } from "./AuthContext";
import { AuthContext } from "./AuthContext";

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

export function withAuth<P extends object>(Component: ComponentType<P>) {
  const displayName = Component.displayName ?? Component.name ?? "Component";

  function WithAuth(props: P) {
    const router = useAppRouter();
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
