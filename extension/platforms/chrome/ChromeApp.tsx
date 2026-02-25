import { RootLayout } from "@app/components/app/RootLayout";
import { RegionProvider } from "@app/lib/auth/RegionContext";
import { SparkleContext } from "@dust-tt/sparkle";
import { ChromeExtensionWrapper } from "@extension/platforms/chrome/ChromeExtensionWrapper";
import { PortProvider } from "@extension/platforms/chrome/context/PortContext";
import { ChromePlatformService } from "@extension/platforms/chrome/services/platform";
import { PlatformProvider } from "@extension/shared/context/PlatformContext";
import { ExtensionFetcherProvider } from "@extension/shared/lib/FetcherProvider";
import { ReactRouterLinkWrapper } from "@extension/shared/ReactRouterLinkWrapper";
import { ExtensionAuthProvider } from "@extension/ui/components/auth/AuthProvider";
import { routes } from "@extension/ui/pages/routes";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

export const ChromeApp = () => {
  const platformService = new ChromePlatformService();
  const router = createBrowserRouter(routes);

  return (
    <PlatformProvider platformService={platformService}>
      <PortProvider>
        <RegionProvider>
          <ExtensionAuthProvider>
            <ExtensionFetcherProvider>
              <SparkleContext.Provider
                value={{ components: { link: ReactRouterLinkWrapper } }}
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
  );
};
