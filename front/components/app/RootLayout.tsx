import { SparkleContext } from "@dust-tt/sparkle";
import { Notification } from "@dust-tt/sparkle";
import { SWRConfig } from "swr";

import { ConfirmPopupArea } from "@app/components/Confirm";
import { NavigationLoadingProvider } from "@app/components/sparkle/NavigationLoadingContext";
import { SidebarProvider } from "@app/components/sparkle/SidebarContext";
import { LinkWrapper, useAppRouter } from "@app/lib/platform";
import { isAPIErrorResponse } from "@app/types/error";

/**
 * This layout is used in _app only
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useAppRouter();

  return (
    <SparkleContext.Provider value={{ components: { link: LinkWrapper } }}>
      <SWRConfig
        value={{
          onError: async (error) => {
            if (
              isAPIErrorResponse(error) &&
              error.error.type === "not_authenticated"
            ) {
              // Redirect to login page.
              await router.push("/api/workos/login");
            }
          },
        }}
      >
        <SidebarProvider>
          <NavigationLoadingProvider>
            <ConfirmPopupArea>
              <Notification.Area>{children}</Notification.Area>
            </ConfirmPopupArea>
          </NavigationLoadingProvider>
        </SidebarProvider>
      </SWRConfig>
    </SparkleContext.Provider>
  );
}
