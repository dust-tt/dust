import { RootLayout } from "@app/components/app/RootLayout";
import { CellProvider, useCellContext } from "@app/lib/auth/CellContext";
import { ClientTypeProvider } from "@app/lib/context/clientType";
import { SparkleContext } from "@dust-tt/sparkle";
import { PortProvider } from "@extension/platforms/firefox/context/PortContext";
import { FirefoxPlatformService } from "@extension/platforms/firefox/services/platform";
import { AuthenticatedImage } from "@extension/shared/AuthenticatedImage";
import { PlatformProvider } from "@extension/shared/context/PlatformContext";
import { useCaptureActions } from "@extension/shared/hooks/useCaptureActions";
import { ExtensionFetcherProvider } from "@extension/shared/lib/ExtensionFetcherProvider";
import { ReactRouterLinkWrapper } from "@extension/shared/ReactRouterLinkWrapper";
import { ExtensionAuthProvider } from "@extension/ui/components/auth/AuthProvider";
import { routes } from "@extension/ui/pages/routes";
import { useMemo } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { FirefoxExtensionWrapper } from "./FirefoxExtensionWrapper";

export const FirefoxApp = () => {
  return (
    <ClientTypeProvider value="extension">
      <CellProvider>
        <FirefoxAppInner />
      </CellProvider>
    </ClientTypeProvider>
  );
};

const FirefoxAppInner = () => {
  const { cells } = useCellContext();
  const platformService = useMemo(() => {
    const service = new FirefoxPlatformService(cells);
    service.useCaptureActions = useCaptureActions;
    return service;
  }, [cells]);
  const router = useMemo(() => createBrowserRouter(routes), []);

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
      <PortProvider>
        <ExtensionAuthProvider>
          <ExtensionFetcherProvider>
            <SparkleContext.Provider value={sparkleContextValue}>
              <RootLayout>
                <FirefoxExtensionWrapper>
                  <RouterProvider router={router} />
                </FirefoxExtensionWrapper>
              </RootLayout>
            </SparkleContext.Provider>
          </ExtensionFetcherProvider>
        </ExtensionAuthProvider>
      </PortProvider>
    </PlatformProvider>
  );
};
