import { LocaleSync } from "@dust-tt/front/components/app/LocaleSync";
import { PostHogTracker } from "@dust-tt/front/components/app/PostHogTracker";
import { SparkleLocaleProvider } from "@dust-tt/front/components/app/SparkleLocaleProvider";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import { SharedFilePage } from "@dust-tt/front/components/pages/share/SharedFilePage";
import { SharedFramePage } from "@dust-tt/front/components/pages/share/SharedFramePage";
import { ShareOgPage } from "@dust-tt/front/components/pages/share/ShareOgPage";
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
        // OG card: /share/og/:wId, rendered by Gotenberg for og:image generation
        {
          path: "/share/og/:wId",
          element: <ShareOgPage />,
        },
      ],
    },
  ],
  {
    basename: import.meta.env?.VITE_BASE_PATH ?? "",
  }
);

export default function ShareApp() {
  return (
    <CellProvider>
      <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
        <PostHogTracker>
          <I18nProvider i18n={i18n}>
            <SparkleLocaleProvider>
              <LocaleSync locale={null} />
              <ErrorBoundary fallback={<GlobalErrorFallback />}>
                <RouterProvider router={router} />
              </ErrorBoundary>
            </SparkleLocaleProvider>
          </I18nProvider>
        </PostHogTracker>
      </FetcherProvider>
    </CellProvider>
  );
}
