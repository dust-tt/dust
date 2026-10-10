import { LocaleSync } from "@dust-tt/front/components/app/LocaleSync";
import { SparkleLocaleProvider } from "@dust-tt/front/components/app/SparkleLocaleProvider";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import { OAuthFinalizePage } from "@dust-tt/front/components/pages/oauth/OAuthFinalizePage";
import { OAuthSetupRedirectPage } from "@dust-tt/front/components/pages/oauth/OAuthSetupRedirectPage";
import { CellProvider } from "@dust-tt/front/lib/auth/CellContext";
import { i18n } from "@dust-tt/front/lib/i18n/i18n";
import { fetcher, fetcherWithBody } from "@dust-tt/front/lib/swr/fetcher";
import { FetcherProvider } from "@dust-tt/front/lib/swr/FetcherContext";
import { I18nProvider } from "@lingui/react";
import { RootRouterLayout } from "@spa/app/layouts/RootRouterLayout";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(
  [
    {
      element: <RootRouterLayout />,
      errorElement: <GlobalErrorFallback />,
      children: [
        // Setup: /w/:wId/oauth/:provider/setup
        {
          path: "/w/:wId/oauth/:provider/setup",
          element: <OAuthSetupRedirectPage />,
        },
        // Finalize: /oauth/:provider/finalize
        {
          path: "/oauth/:provider/finalize",
          element: <OAuthFinalizePage />,
        },
      ],
    },
  ],
  {
    basename: import.meta.env?.VITE_BASE_PATH ?? "",
  }
);

export default function OAuthApp() {
  return (
    <CellProvider>
      <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
        <I18nProvider i18n={i18n}>
          <SparkleLocaleProvider>
            <LocaleSync locale={null} />
            <ErrorBoundary fallback={<GlobalErrorFallback />}>
              <RouterProvider router={router} />
            </ErrorBoundary>
          </SparkleLocaleProvider>
        </I18nProvider>
      </FetcherProvider>
    </CellProvider>
  );
}
