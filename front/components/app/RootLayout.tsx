import { ConfirmPopupArea } from "@app/components/Confirm";
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
        <ConfirmPopupArea>
          <Notification.Area>{children}</Notification.Area>
        </ConfirmPopupArea>
      </SidebarProvider>
    </SparkleContext.Provider>
  );
}
