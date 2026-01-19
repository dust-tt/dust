import { SparkleContext, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";

import { ReactRouterLinkWrapper } from "@app/app/src/components/ReactRouterLinkWrapper";
import { WelcomeTourGuideProvider } from "@app/components/assistant/WelcomeTourGuideProvider";
import { DesktopNavigationProvider } from "@app/components/navigation/DesktopNavigationContext";
import { NavigationLoadingProvider } from "@app/components/sparkle/NavigationLoadingContext";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAuthContextResponseType } from "@app/pages/api/w/[wId]/auth-context";

interface AuthenticatedLayoutProps {
  children?: ReactNode;
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const { wId } = useParams<{ wId: string }>();

  const { data, isLoading } = useSWRWithDefaults<
    string,
    GetAuthContextResponseType
  >(`/api/w/${wId ?? "-"}/auth-context`, fetcher);
  useEffect(() => {
    if (!isLoading && (!data || !("user" in data) || !data.user)) {
      const baseUrl = import.meta.env.VITE_DUST_CLIENT_FACING_URL ?? "";
      // TODO: returnTo can't be absolute, server/port is lost on redirect after login
      window.location.href = `${baseUrl}/api/workos/login?returnTo=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`;
    }
  }, [isLoading, data]);

  if (isLoading || !data || !("user" in data) || !data.user) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  console.log("AuthenticatedLayout render with user:", data);

  // Context passed to child routes via Outlet
  const outletContext = {
    workspace: data.workspace,
    subscription: data.subscription,
    user: data.user,
    isAdmin: data.isAdmin,
    isBuilder: data.isBuilder,
  };

  return (
    <SparkleContext.Provider
      value={{ components: { link: ReactRouterLinkWrapper } }}
    >
      <ThemeProvider>
        <WelcomeTourGuideProvider>
          <NavigationLoadingProvider>
            <DesktopNavigationProvider>
              <AuthContext.Provider value={data as AuthContextValue}>
                {children ?? <Outlet context={outletContext} />}
              </AuthContext.Provider>
            </DesktopNavigationProvider>
          </NavigationLoadingProvider>
        </WelcomeTourGuideProvider>
      </ThemeProvider>
    </SparkleContext.Provider>
  );
}
