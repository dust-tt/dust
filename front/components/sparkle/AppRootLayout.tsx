import { AgentLoopStreamProvider } from "@app/components/assistant/conversation/AgentLoopStreamProvider";
import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { WelcomeTourGuideProvider } from "@app/components/assistant/WelcomeTourGuideProvider";
import { CommandPaletteProvider } from "@app/components/command_palette/CommandPaletteContext";
import { DesktopNavigationProvider } from "@app/components/navigation/DesktopNavigationContext";
import { useAppHeadSetup } from "@app/hooks/useAppHeadSetup";
import { useDatadogLogs } from "@app/hooks/useDatadogLogs";
import { useSetupNotifications } from "@app/hooks/useSetupNotifications";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { ClientTypeProvider } from "@app/lib/context/clientType";
import type React from "react";

export default function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = useWorkspace();
  useDatadogLogs();
  useSetupNotifications();
  useAppHeadSetup();

  return (
    <AgentLoopStreamProvider owner={owner}>
      <ClientTypeProvider value="web">
        <WelcomeTourGuideProvider>
          <CommandPaletteProvider>
            <DesktopNavigationProvider>
              <InputBarProvider>{children}</InputBarProvider>
            </DesktopNavigationProvider>
          </CommandPaletteProvider>
        </WelcomeTourGuideProvider>
      </ClientTypeProvider>
    </AgentLoopStreamProvider>
  );
}
