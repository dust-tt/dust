import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { SharedFilePage } from "@dust-tt/front/components/pages/share/SharedFilePage";
import { SharedFramePage } from "@dust-tt/front/components/pages/share/SharedFramePage";
import { RegionProvider } from "@dust-tt/front/lib/auth/RegionContext";
import { FetcherProvider } from "@dust-tt/front/lib/swr/FetcherContext";
import { fetcher, fetcherWithBody } from "@dust-tt/front/lib/swr/fetcher";
import { GlobalErrorFallback } from "@spa/app/components/GlobalErrorFallback";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(
  [
    // Frame: /share/frame/:token
    {
      path: "/share/frame/:token",
      element: <SharedFramePage />,
    },
    // File: /share/file/:token (redirects to frame)
    {
      path: "/share/file/:token",
      element: <SharedFilePage />,
    },
  ],
  {
    basename: import.meta.env?.VITE_BASE_PATH ?? "",
  }
);

export default function ShareApp() {
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
