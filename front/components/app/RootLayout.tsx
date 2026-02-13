import { ConfirmPopupArea } from "@app/components/Confirm";
import { NavigationLoadingProvider } from "@app/components/sparkle/NavigationLoadingContext";
import { SidebarProvider } from "@app/components/sparkle/SidebarContext";
import { useStripUtmParams } from "@app/hooks/useStripUtmParams";
import { LinkWrapper, useAppRouter } from "@app/lib/platform";
import { isAPIErrorResponse } from "@app/types/error";
import { Notification, SparkleContext } from "@dust-tt/sparkle";
import { SWRConfig } from "swr";

/**
 * This layout is used in _app only
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useAppRouter();
  useStripUtmParams();

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
