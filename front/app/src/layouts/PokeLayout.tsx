import { SparkleContext, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";

import { ReactRouterLinkWrapper } from "@app/app/src/components/ReactRouterLinkWrapper";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import type { RegionType } from "@app/lib/api/regions/config";
import { Head } from "@app/lib/platform";
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

interface PokeAuthContextValue {
  user: UserType;
  isSuperUser: true;
}

interface PokeWorkspaceContextValue {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
}

const PokeAuthContext = createContext<PokeAuthContextValue | null>(null);
const PokeWorkspaceContext = createContext<PokeWorkspaceContextValue | null>(
  null
);

export function usePokeAuth(): PokeAuthContextValue {
  const ctx = useContext(PokeAuthContext);
  if (!ctx) {
    throw new Error("usePokeAuth must be used within PokeLayout");
  }
  return ctx;
}

export function usePokeWorkspace(): PokeWorkspaceContextValue {
  const ctx = useContext(PokeWorkspaceContext);
  if (!ctx) {
    throw new Error(
      "usePokeWorkspace must be used within PokeLayout with a workspace route"
    );
  }
  return ctx;
}

const PokePageTitleContext = createContext<string>("");

export function usePokePageTitle() {
  return useContext(PokePageTitleContext);
}

interface PokeLayoutProps {
  children?: ReactNode;
  title?: string;
}

export function PokeLayout({ children, title = "Poke" }: PokeLayoutProps) {
  const { wId } = useParams<{ wId?: string }>();
  const [redirecting, setRedirecting] = useState(false);

  // Fetch global poke auth (superuser check)
  const { data: authData, isLoading: isAuthLoading } = useSWRWithDefaults<
    string,
    GetPokeAuthContextResponseType
  >("/api/poke/auth-context", fetcher);

  // Fetch workspace-specific auth when wId is present
  const { data: workspaceAuthData, isLoading: isWorkspaceLoading } =
    useSWRWithDefaults<string, GetPokeWorkspaceAuthContextResponseType>(
      `/api/poke/workspaces/${wId ?? "-"}/auth-context`,
      fetcher
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

  const pokeAuthValue: PokeAuthContextValue = {
    user: authData.user,
    isSuperUser: authData.isSuperUser,
  };

  const workspaceContextValue: PokeWorkspaceContextValue | null =
    workspaceAuthData
      ? {
          owner: workspaceAuthData.workspace,
          subscription: workspaceAuthData.subscription,
        }
      : null;

  const content = (
    <SparkleContext.Provider
      value={{ components: { link: ReactRouterLinkWrapper } }}
    >
      <ThemeProvider>
        <PokePageTitleContext.Provider value={title}>
          <Head>
            <title>{"Poke - " + title}</title>
          </Head>
          <PokeAuthContext.Provider value={pokeAuthValue}>
            <div className="min-h-dvh bg-muted-background dark:bg-muted-background-night dark:text-white">
              <PokeNavbar
                currentRegion={regionData?.region}
                regionUrls={regionData?.regionUrls}
                title={title}
              />
              <div className="flex flex-col p-6">{children ?? <Outlet />}</div>
            </div>
          </PokeAuthContext.Provider>
        </PokePageTitleContext.Provider>
      </ThemeProvider>
    </SparkleContext.Provider>
  );

  // Wrap with workspace context if available
  if (workspaceContextValue) {
    return (
      <PokeWorkspaceContext.Provider value={workspaceContextValue}>
        {content}
      </PokeWorkspaceContext.Provider>
    );
  }

  return content;
}

// Wrapper component that extracts title from route data
export function PokeLayoutWrapper() {
  return <PokeLayout />;
}
