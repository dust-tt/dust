import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { WelcomeTourGuideProvider } from "@app/components/assistant/WelcomeTourGuideProvider";
import { CommandPaletteProvider } from "@app/components/command_palette/CommandPaletteContext";
import { DesktopNavigationProvider } from "@app/components/navigation/DesktopNavigationContext";
import { useAppHeadSetup } from "@app/hooks/useAppHeadSetup";
import { useDatadogLogs } from "@app/hooks/useDatadogLogs";
import { useSetupNotifications } from "@app/hooks/useSetupNotifications";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { eventSourceManager } from "@app/lib/client/event_source_manager";
import { ClientTypeProvider } from "@app/lib/context/clientType";
import type React from "react";
import { useEffect } from "react";

export default function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = useWorkspace();
  useDatadogLogs();
  useSetupNotifications();
  useAppHeadSetup();

  useEffect(
    () => () => eventSourceManager.releaseWorkspace(owner.sId),
    [owner.sId]
  );

  return (
    <ClientTypeProvider value="web">
      <WelcomeTourGuideProvider>
        <CommandPaletteProvider>
          <DesktopNavigationProvider>
            <InputBarProvider>{children}</InputBarProvider>
          </DesktopNavigationProvider>
        </CommandPaletteProvider>
      </WelcomeTourGuideProvider>
    </ClientTypeProvider>
  );
}
