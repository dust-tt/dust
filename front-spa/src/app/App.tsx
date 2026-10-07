import { AppI18nProvider } from "@dust-tt/front/components/app/AppI18nProvider";
import { PostHogTracker } from "@dust-tt/front/components/app/PostHogTracker";
import { RootLayout } from "@dust-tt/front/components/app/RootLayout";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import { CellProvider } from "@dust-tt/front/lib/auth/CellContext";
import { fetcher, fetcherWithBody } from "@dust-tt/front/lib/swr/fetcher";
import { FetcherProvider } from "@dust-tt/front/lib/swr/FetcherContext";
import { SparkleContext } from "@dust-tt/sparkle";
import { AppReadyProvider } from "@spa/app/contexts/AppReadyContext";
import { routes } from "@spa/app/routes";
import { ReactRouterLinkWrapper } from "@spa/lib/ReactRouterLinkWrapper";
import { useMemo } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(routes, {
  basename: import.meta.env?.VITE_BASE_PATH ?? "",
});

export default function App() {
  const sparkleContextValue = useMemo(
    () => ({ components: { link: ReactRouterLinkWrapper } }),
    []
  );

  return (
    <AppReadyProvider>
      <CellProvider>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          <PostHogTracker authenticated>
            <SparkleContext.Provider value={sparkleContextValue}>
              <AppI18nProvider>
                <RootLayout>
                  <ErrorBoundary fallback={<GlobalErrorFallback />}>
                    <RouterProvider router={router} />
                  </ErrorBoundary>
                </RootLayout>
              </AppI18nProvider>
            </SparkleContext.Provider>
          </PostHogTracker>
        </FetcherProvider>
      </CellProvider>
    </AppReadyProvider>
  );
}
