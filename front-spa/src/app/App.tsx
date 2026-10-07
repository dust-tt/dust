import { PostHogTracker } from "@dust-tt/front/components/app/PostHogTracker";
import { RootLayout } from "@dust-tt/front/components/app/RootLayout";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import { CellProvider } from "@dust-tt/front/lib/auth/CellContext";
import { i18n } from "@dust-tt/front/lib/i18n/i18n";
import { fetcher, fetcherWithBody } from "@dust-tt/front/lib/swr/fetcher";
import { FetcherProvider } from "@dust-tt/front/lib/swr/FetcherContext";
import { SparkleContext } from "@dust-tt/sparkle";
import { I18nProvider } from "@lingui/react";
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
              <I18nProvider i18n={i18n}>
                <RootLayout>
                  <ErrorBoundary fallback={<GlobalErrorFallback />}>
                    <RouterProvider router={router} />
                  </ErrorBoundary>
                </RootLayout>
              </I18nProvider>
            </SparkleContext.Provider>
          </PostHogTracker>
        </FetcherProvider>
      </CellProvider>
    </AppReadyProvider>
  );
}
