import { AppI18nProvider } from "@dust-tt/front/components/app/AppI18nProvider";
import { RootLayout } from "@dust-tt/front/components/app/RootLayout";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { SparkleContext } from "@dust-tt/sparkle";
import { GlobalErrorFallback } from "@spa/app/components/GlobalErrorFallback";
import { ReactRouterLinkWrapper } from "@spa/lib/ReactRouterLinkWrapper";
import type { ComponentProps } from "react";
import { RouterProvider } from "react-router-dom";

const sparkleContextValue = { components: { link: ReactRouterLinkWrapper } };

interface SpaRouterRootProps {
  router: ComponentProps<typeof RouterProvider>["router"];
}

// Shared UI shell (Sparkle links, i18n, layout, error boundary) for SPA entry
// points that render the full app chrome around a router.
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
