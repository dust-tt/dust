import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { WelcomeTourGuideProvider } from "@app/components/assistant/WelcomeTourGuideProvider";
import { DesktopNavigationProvider } from "@app/components/navigation/DesktopNavigationContext";
import { QuickStartGuide } from "@app/components/QuickStartGuide";
import { useAppHeadSetup } from "@app/hooks/useAppHeadSetup";
import { useDatadogLogs } from "@app/hooks/useDatadogLogs";
import { useGTMScript } from "@app/hooks/useGTMScript";
import { useSetupNotifications } from "@app/hooks/useSetupNotifications";
import { useAuth } from "@app/lib/auth/AuthContext";
import { ClientTypeProvider } from "@app/lib/context/clientType";
import type React from "react";
import { useEffect } from "react";

export default function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  useDatadogLogs();
  useSetupNotifications();
  useAppHeadSetup();
  useGTMScript();

  useEffect(() => {
    if (typeof window !== "undefined" && user?.sId) {
      // Identify the user with GTM
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        userId: user.sId,
        event: "userIdentified",
      });
    }
  }, [user?.sId]);

  return (
    <ClientTypeProvider value="web">
      <WelcomeTourGuideProvider>
        <DesktopNavigationProvider>
          <InputBarProvider>
            {children}
            <QuickStartGuide />
          </InputBarProvider>
        </DesktopNavigationProvider>
      </WelcomeTourGuideProvider>
    </ClientTypeProvider>
  );
}
