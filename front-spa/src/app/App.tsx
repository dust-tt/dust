import { PostHogTracker } from "@dust-tt/front/components/app/PostHogTracker";
import { RootLayout } from "@dust-tt/front/components/app/RootLayout";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { RegionProvider } from "@dust-tt/front/lib/auth/RegionContext";
import { clientFetch } from "@dust-tt/front/lib/egress/client.js";
import { FetcherProvider } from "@dust-tt/front/lib/swr/FetcherContext";
import { fetcher, fetcherWithBody } from "@dust-tt/front/lib/swr/fetcher";
import { SparkleContext } from "@dust-tt/sparkle";
import { GlobalErrorFallback } from "@spa/app/components/GlobalErrorFallback";
import { AppReadyProvider } from "@spa/app/contexts/AppReadyContext";
import { routes } from "@spa/app/routes";
import { ReactRouterLinkWrapper } from "@spa/lib/ReactRouterLinkWrapper";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(routes, {
  basename: import.meta.env?.VITE_BASE_PATH ?? "",
});

export default function App() {
  return (
    <AppReadyProvider>
      <RegionProvider>
        <FetcherProvider
          fetcher={fetcher}
          fetcherWithBody={fetcherWithBody}
          clientFetch={clientFetch}
        >
          <PostHogTracker authenticated>
            <SparkleContext.Provider
              value={{ components: { link: ReactRouterLinkWrapper } }}
            >
              <RootLayout>
                <ErrorBoundary fallback={<GlobalErrorFallback />}>
                  <RouterProvider router={router} />
                </ErrorBoundary>
              </RootLayout>
            </SparkleContext.Provider>
          </PostHogTracker>
        </FetcherProvider>
      </RegionProvider>
    </AppReadyProvider>
  );
}
