import { RootLayout } from "@app/components/app/RootLayout";
import { SparkleLocaleProvider } from "@app/components/app/SparkleLocaleProvider";
import { CellProvider, useCellContext } from "@app/lib/auth/CellContext";
import { ClientTypeProvider } from "@app/lib/context/clientType";
import { i18n } from "@app/lib/i18n/i18n";
import { SparkleContext } from "@dust-tt/sparkle";
import { ExcelPlatformService } from "@extension/platforms/excel/services/platform";
import { AuthenticatedImage } from "@extension/shared/AuthenticatedImage";
import { PlatformProvider } from "@extension/shared/context/PlatformContext";
import { ExtensionFetcherProvider } from "@extension/shared/lib/ExtensionFetcherProvider";
import { ReactRouterLinkWrapper } from "@extension/shared/ReactRouterLinkWrapper";
import { ExtensionAuthProvider } from "@extension/ui/components/auth/AuthProvider";
import { routes } from "@extension/ui/pages/routes";
import { I18nProvider } from "@lingui/react";
import { useMemo } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

export const ExcelApp = () => {
  return (
    <I18nProvider i18n={i18n}>
      <SparkleLocaleProvider>
        <ClientTypeProvider value="extension">
          <CellProvider>
            <ExcelAppInner />
          </CellProvider>
        </ClientTypeProvider>
      </SparkleLocaleProvider>
    </I18nProvider>
  );
};

const ExcelAppInner = () => {
  const { cells } = useCellContext();
  const platformService = useMemo(
    () => new ExcelPlatformService(cells),
    [cells]
  );

  const router = useMemo(
    () => createMemoryRouter(routes, { initialEntries: ["/"] }),
    []
  );

  const sparkleContextValue = useMemo(
    () => ({
      components: {
        link: ReactRouterLinkWrapper,
        image: AuthenticatedImage,
      },
    }),
    []
  );

  return (
    <PlatformProvider platformService={platformService}>
      <ExtensionAuthProvider>
        <ExtensionFetcherProvider>
          <SparkleContext.Provider value={sparkleContextValue}>
            <RootLayout>
              <RouterProvider router={router} />
            </RootLayout>
          </SparkleContext.Provider>
        </ExtensionFetcherProvider>
      </ExtensionAuthProvider>
    </PlatformProvider>
  );
};
