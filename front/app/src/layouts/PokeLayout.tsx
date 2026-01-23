import { SparkleContext, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Outlet, useMatches } from "react-router-dom";

import { ReactRouterLinkWrapper } from "@app/app/src/components/ReactRouterLinkWrapper";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import type { RegionType } from "@app/lib/api/regions/config";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { Head, usePathParams } from "@app/lib/platform";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  LightWorkspaceType,
  SubscriptionType,
  UserType,
} from "@app/types";

// Define response types inline to avoid importing from API files (which have server-side dependencies)
type GetPokeAuthContextResponseType =
  | { user: UserType; isSuperUser: true }
  | { user: null; isSuperUser: false };

type GetPokeWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isSuperUser: true;
};

type GetRegionResponseType = {
  region: RegionType;
  regionUrls: Record<RegionType, string>;
};

interface RouteHandle {
  title?: string;
}

interface PokeLayoutProps {
  children?: ReactNode;
}

export function PokeLayout({ children }: PokeLayoutProps) {
  const params = usePathParams();
  const wId = params.wId;
  const [redirecting, setRedirecting] = useState(false);

  // Get title from the deepest matched route's handle
  const matches = useMatches();
  const title = matches
    .slice()
    .reverse()
    .find((match) => (match.handle as RouteHandle)?.title)?.handle as
    | RouteHandle
    | undefined;
  const pageTitle = title?.title ?? "Poke";

  // Fetch global poke auth (superuser check)
  const { data: authData, isLoading: isAuthLoading } = useSWRWithDefaults<
    string,
    GetPokeAuthContextResponseType
  >("/api/poke/auth-context", fetcher);

  // Fetch workspace-specific auth when wId is present
  const { data: workspaceAuthData, isLoading: isWorkspaceLoading } =
    useSWRWithDefaults<string, GetPokeWorkspaceAuthContextResponseType>(
      `/api/poke/workspaces/${wId}/auth-context`,
      fetcher,
      { disabled: !wId }
    );

  const { data: regionData } = useSWRWithDefaults<
    string,
    GetRegionResponseType
  >("/api/poke/region", fetcher);

  useEffect(() => {
    if (
      !isAuthLoading &&
      (!authData || !authData.user || !authData.isSuperUser)
    ) {
      setRedirecting(true);
      const baseUrl = import.meta.env.VITE_DUST_CLIENT_FACING_URL ?? "";
      window.location.href = `${baseUrl}/api/workos/login?returnTo=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`;
    }
  }, [isAuthLoading, authData]);

  const isLoading = isAuthLoading || (wId && isWorkspaceLoading);

  if (isLoading || redirecting || !authData || !authData.user) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  // If we have a wId but workspace auth failed, show error
  if (wId && !workspaceAuthData) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="text-red-500">Workspace not found</p>
      </div>
    );
  }

  const authContextValue: AuthContextValue = {
    user: authData.user,
    isSuperUser: authData.isSuperUser,
    isAdmin: true, // Superusers have admin privileges
    isBuilder: true, // Superusers have builder privileges
    workspace: workspaceAuthData?.workspace,
    subscription: workspaceAuthData?.subscription,
  };

  return (
    <SparkleContext.Provider
      value={{ components: { link: ReactRouterLinkWrapper } }}
    >
      <ThemeProvider>
        <Head>
          <title>{"Poke - " + pageTitle}</title>
        </Head>
        <AuthContext.Provider value={authContextValue}>
          <div className="min-h-dvh bg-muted-background dark:bg-muted-background-night dark:text-white">
            <PokeNavbar
              currentRegion={regionData?.region}
              regionUrls={regionData?.regionUrls}
              title={pageTitle}
            />
            <div className="flex flex-col p-6">{children ?? <Outlet />}</div>
          </div>
        </AuthContext.Provider>
      </ThemeProvider>
    </SparkleContext.Provider>
  );
}
