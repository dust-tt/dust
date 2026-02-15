import { ConfirmPopupArea } from "@app/components/Confirm";
import { NavigationLoadingProvider } from "@app/components/sparkle/NavigationLoadingContext";
import { SidebarProvider } from "@app/components/sparkle/SidebarContext";
import { useStripUtmParams } from "@app/hooks/useStripUtmParams";
import { LinkWrapper } from "@app/lib/platform";
import { Notification, SparkleContext } from "@dust-tt/sparkle";

/**
 * This layout is used in _app only
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useStripUtmParams();

  return (
    <SparkleContext.Provider value={{ components: { link: LinkWrapper } }}>
      <SidebarProvider>
        <NavigationLoadingProvider>
          <ConfirmPopupArea>
            <Notification.Area>{children}</Notification.Area>
          </ConfirmPopupArea>
        </NavigationLoadingProvider>
      </SidebarProvider>
    </SparkleContext.Provider>
  );
}
