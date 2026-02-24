import { ConfirmPopupArea } from "@app/components/Confirm";
import { SidebarProvider } from "@app/components/sparkle/SidebarContext";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import { useStripUtmParams } from "@app/hooks/useStripUtmParams";
import { Notification } from "@dust-tt/sparkle";

/**
 * This layout is used in _app only
 */
export function RootLayout({ children }: { children: React.ReactNode }) {
  useStripUtmParams();

  return (
    <ThemeProvider>
      <SidebarProvider>
        <ConfirmPopupArea>
          <Notification.Area>{children}</Notification.Area>
        </ConfirmPopupArea>
      </SidebarProvider>
    </ThemeProvider>
  );
}
