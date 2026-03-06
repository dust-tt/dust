import { ConfirmPopupArea } from "@app/components/Confirm";
import { NoOpDesktopNavigationProvider } from "@app/components/navigation/DesktopNavigationContext";
import { SidebarProvider } from "@app/components/sparkle/SidebarContext";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import { useServerPageView } from "@app/hooks/useServerPageView";
import { useStripUtmParams } from "@app/hooks/useStripUtmParams";
import { Notification } from "@dust-tt/sparkle";

/**
 * This layout is used in _app only
 */
export function RootLayout({ children }: { children: React.ReactNode }) {
  useStripUtmParams();
  useServerPageView();

  return (
    <ThemeProvider>
      <SidebarProvider>
        <NoOpDesktopNavigationProvider>
          <ConfirmPopupArea>
            <Notification.Area>{children}</Notification.Area>
          </ConfirmPopupArea>
        </NoOpDesktopNavigationProvider>
      </SidebarProvider>
    </ThemeProvider>
  );
}
