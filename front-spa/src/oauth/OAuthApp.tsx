import { AppI18nProvider } from "@dust-tt/front/components/app/AppI18nProvider";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { OAuthFinalizePage } from "@dust-tt/front/components/pages/oauth/OAuthFinalizePage";
import { OAuthSetupRedirectPage } from "@dust-tt/front/components/pages/oauth/OAuthSetupRedirectPage";
import { CellProvider } from "@dust-tt/front/lib/auth/CellContext";
import { fetcher, fetcherWithBody } from "@dust-tt/front/lib/swr/fetcher";
import { FetcherProvider } from "@dust-tt/front/lib/swr/FetcherContext";
import { GlobalErrorFallback } from "@spa/app/components/GlobalErrorFallback";
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
        <AppI18nProvider>
          <ErrorBoundary fallback={<GlobalErrorFallback />}>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </AppI18nProvider>
      </FetcherProvider>
    </CellProvider>
  );
}
