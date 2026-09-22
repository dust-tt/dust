import { ConfirmPopupArea } from "@app/components/Confirm";
import { NoOpDesktopNavigationProvider } from "@app/components/navigation/DesktopNavigationContext";
import { SidebarProvider } from "@app/components/sparkle/SidebarContext";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import { useStripUtmParams } from "@app/hooks/useStripUtmParams";
import { Notification } from "@dust-tt/sparkle";
import { ConversationSidePanelProvider } from "../assistant/conversation/ConversationSidePanelContext";

/**
 * This layout is used in _app only
 *
 * ConversationFontProvider is intentionally NOT mounted here: this layout
 * wraps unauthenticated routes too, and the provider's user-metadata fetch
 * must only run behind an auth gate. It is mounted in `AppContentRouterLayout`, 
 * where the font is actually consumed (conversation views and the sidebar settings popover).
 */
export function RootLayout({ children }: { children: React.ReactNode }) {
  useStripUtmParams();

  return (
    <ThemeProvider>
      <SidebarProvider>
        <NoOpDesktopNavigationProvider>
          <ConfirmPopupArea>
            <ConversationSidePanelProvider>
              <Notification.Area>{children}</Notification.Area>
            </ConversationSidePanelProvider>
          </ConfirmPopupArea>
        </NoOpDesktopNavigationProvider>
      </SidebarProvider>
    </ThemeProvider>
  );
}
