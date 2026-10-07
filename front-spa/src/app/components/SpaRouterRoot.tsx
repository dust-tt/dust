import { RootLayout } from "@dust-tt/front/components/app/RootLayout";
import { SparkleLocaleProvider } from "@dust-tt/front/components/app/SparkleLocaleProvider";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import { i18n } from "@dust-tt/front/lib/i18n/i18n";
import { SparkleContext } from "@dust-tt/sparkle";
import { I18nProvider } from "@lingui/react";
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
      <I18nProvider i18n={i18n}>
        <SparkleLocaleProvider>
          <RootLayout>
            <ErrorBoundary fallback={<GlobalErrorFallback />}>
              <RouterProvider router={router} />
            </ErrorBoundary>
          </RootLayout>
        </SparkleLocaleProvider>
      </I18nProvider>
    </SparkleContext.Provider>
  );
}
