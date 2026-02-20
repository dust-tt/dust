import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { OAuthFinalizePage } from "@dust-tt/front/components/pages/oauth/OAuthFinalizePage";
import { OAuthSetupRedirectPage } from "@dust-tt/front/components/pages/oauth/OAuthSetupRedirectPage";
import { RegionProvider } from "@dust-tt/front/lib/auth/RegionContext";
import { FetcherProvider } from "@dust-tt/front/lib/swr/FetcherContext";
import { fetcher, fetcherWithBody } from "@dust-tt/front/lib/swr/fetcher";
import { GlobalErrorFallback } from "@spa/app/components/GlobalErrorFallback";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(
  [
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
  {
    basename: import.meta.env.VITE_BASE_PATH ?? "",
  }
);

export default function OAuthApp() {
  return (
    <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
      <RegionProvider>
        <ErrorBoundary fallback={<GlobalErrorFallback />}>
          <RouterProvider router={router} />
        </ErrorBoundary>
      </RegionProvider>
    </FetcherProvider>
  );
}
