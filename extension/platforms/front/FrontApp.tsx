import { RootLayout } from "@app/components/app/RootLayout";
import { RegionProvider } from "@app/lib/auth/RegionContext";
import { FrontPlatformProvider } from "@extension/platforms/front/context/FrontPlatformProvider";
import { FrontContextProvider } from "@extension/platforms/front/context/FrontProvider";
import { ExtensionFetcherProvider } from "@extension/shared/lib/ExtensionFetcherProvider";
import { ExtensionAuthProvider } from "@extension/ui/components/auth/AuthProvider";
import { routes } from "@extension/ui/pages/routes";
import { useEffect, useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

// Create a router instance outside the component to avoid recreation.
// Use memory router to avoid interfering with the parent page.
const router = createMemoryRouter(routes, {
  initialEntries: ["/"],
  initialIndex: 0,
});

export const FrontApp = () => {
  const [isMounted, setIsMounted] = useState(false);
  const [isIframeReady, setIsIframeReady] = useState(false);

  // Handle cleanup when the component unmounts.
  useEffect(() => {
    // Check if we're in an iframe.
    const isInIframe = window.self !== window.top;

    // Set iframe ready state.
    setIsIframeReady(isInIframe ? document.readyState === "complete" : true);

    // Set mounted state.
    setIsMounted(true);

    return () => {
      setIsMounted(false);
    };
  }, []);

  // Only render the app if it's mounted and iframe is ready.
  if (!isMounted || !isIframeReady) {
    return null;
  }

  return (
    <FrontContextProvider>
      <FrontPlatformProvider>
        <RegionProvider>
          <ExtensionAuthProvider>
            <ExtensionFetcherProvider>
              <RootLayout>
                <RouterProvider router={router} key="front-router" />
              </RootLayout>
            </ExtensionFetcherProvider>
          </ExtensionAuthProvider>
        </RegionProvider>
      </FrontPlatformProvider>
    </FrontContextProvider>
  );
};
