import { RootLayout } from "@dust-tt/front/components/app/RootLayout";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary.js";
import { RegionProvider } from "@dust-tt/front/lib/auth/RegionContext";
import { FetcherProvider } from "@dust-tt/front/lib/swr/FetcherContext";
import { fetcher, fetcherWithBody } from "@dust-tt/front/lib/swr/fetcher";
import { SparkleContext } from "@dust-tt/sparkle";
import { GlobalErrorFallback } from "@spa/app/components/GlobalErrorFallback";
import { AppReadyProvider } from "@spa/app/contexts/AppReadyContext";
import { ReactRouterLinkWrapper } from "@spa/lib/ReactRouterLinkWrapper";
import { routes } from "@spa/poke/routes";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(routes, {
  basename: import.meta.env?.VITE_BASE_PATH ?? "",
});

export default function PokeApp() {
  return (
    <AppReadyProvider>
      <RegionProvider>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          <SparkleContext.Provider
            value={{ components: { link: ReactRouterLinkWrapper } }}
          >
            <RootLayout>
              <ErrorBoundary fallback={<GlobalErrorFallback />}>
                <RouterProvider router={router} />
              </ErrorBoundary>
            </RootLayout>
          </SparkleContext.Provider>
        </FetcherProvider>
      </RegionProvider>
    </AppReadyProvider>
  );
}
