import { AppI18nProvider } from "@dust-tt/front/components/app/AppI18nProvider";
import { RootLayout } from "@dust-tt/front/components/app/RootLayout";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import { SparkleContext } from "@dust-tt/sparkle";
import { ReactRouterLinkWrapper } from "@spa/lib/ReactRouterLinkWrapper";
import type { createBrowserRouter } from "react-router-dom";
import { RouterProvider } from "react-router-dom";

const sparkleContextValue = { components: { link: ReactRouterLinkWrapper } };

interface SpaRouterRootProps {
  router: ReturnType<typeof createBrowserRouter>;
}

// Shared UI providers + router for the SPA entry points (app and poke).
export function SpaRouterRoot({ router }: SpaRouterRootProps) {
  return (
    <SparkleContext.Provider value={sparkleContextValue}>
      <AppI18nProvider>
        <RootLayout>
          <ErrorBoundary fallback={<GlobalErrorFallback />}>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </RootLayout>
      </AppI18nProvider>
    </SparkleContext.Provider>
  );
}
