import { RootLayout } from "@app/components/app/RootLayout";
import { RegionProvider } from "@app/lib/auth/RegionContext";
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
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { FirefoxExtensionWrapper } from "./FirefoxExtensionWrapper";

export const FirefoxApp = () => {
  const platformService = new FirefoxPlatformService();
  platformService.useCaptureActions = useCaptureActions;
  const router = createBrowserRouter(routes);

  return (
    <ClientTypeProvider value="extension">
      <PlatformProvider platformService={platformService}>
        <PortProvider>
          <RegionProvider>
            <ExtensionAuthProvider>
              <ExtensionFetcherProvider>
                <SparkleContext.Provider
                  value={{
                    components: {
                      link: ReactRouterLinkWrapper,
                      image: AuthenticatedImage,
                    },
                  }}
                >
                  <RootLayout>
                    <FirefoxExtensionWrapper>
                      <RouterProvider router={router} />
                    </FirefoxExtensionWrapper>
                  </RootLayout>
                </SparkleContext.Provider>
              </ExtensionFetcherProvider>
            </ExtensionAuthProvider>
          </RegionProvider>
        </PortProvider>
      </PlatformProvider>
    </ClientTypeProvider>
  );
};
