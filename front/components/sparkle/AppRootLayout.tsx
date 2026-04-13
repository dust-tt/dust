import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { WelcomeTourGuideProvider } from "@app/components/assistant/WelcomeTourGuideProvider";
import { CommandPaletteProvider } from "@app/components/command_palette/CommandPaletteContext";
import { DesktopNavigationProvider } from "@app/components/navigation/DesktopNavigationContext";
import { QuickStartGuide } from "@app/components/QuickStartGuide";
import { useAppHeadSetup } from "@app/hooks/useAppHeadSetup";
import { useDatadogLogs } from "@app/hooks/useDatadogLogs";
import { useSetupNotifications } from "@app/hooks/useSetupNotifications";
import { ClientTypeProvider } from "@app/lib/context/clientType";
import type React from "react";

export default function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useDatadogLogs();
  useSetupNotifications();
  useAppHeadSetup();

  return (
    <ClientTypeProvider value="web">
      <WelcomeTourGuideProvider>
        <CommandPaletteProvider>
          <DesktopNavigationProvider>
            <InputBarProvider>
              {children}
              <QuickStartGuide />
            </InputBarProvider>
          </DesktopNavigationProvider>
        </CommandPaletteProvider>
      </WelcomeTourGuideProvider>
    </ClientTypeProvider>
  );
}
