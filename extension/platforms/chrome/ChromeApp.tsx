import { RootLayout } from "@app/components/app/RootLayout";
import { RegionProvider } from "@app/lib/auth/RegionContext";
import { ClientTypeProvider } from "@app/lib/context/clientType";
import { SparkleContext } from "@dust-tt/sparkle";
import { ChromeExtensionWrapper } from "@extension/platforms/chrome/ChromeExtensionWrapper";
import { PortProvider } from "@extension/platforms/chrome/context/PortContext";
import { ChromePlatformService } from "@extension/platforms/chrome/services/platform";
import { AuthenticatedImage } from "@extension/shared/AuthenticatedImage";
import { PlatformProvider } from "@extension/shared/context/PlatformContext";
import { useCaptureActions } from "@extension/shared/hooks/useCaptureActions";
import { ExtensionFetcherProvider } from "@extension/shared/lib/ExtensionFetcherProvider";
import { ReactRouterLinkWrapper } from "@extension/shared/ReactRouterLinkWrapper";
import { ExtensionAuthProvider } from "@extension/ui/components/auth/AuthProvider";
import { routes } from "@extension/ui/pages/routes";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

export const ChromeApp = () => {
  const platformService = new ChromePlatformService();
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
                    <ChromeExtensionWrapper>
                      <RouterProvider router={router} />
                    </ChromeExtensionWrapper>
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
