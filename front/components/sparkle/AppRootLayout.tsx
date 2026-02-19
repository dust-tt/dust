import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { WelcomeTourGuideProvider } from "@app/components/assistant/WelcomeTourGuideProvider";
import { DesktopNavigationProvider } from "@app/components/navigation/DesktopNavigationContext";
import { QuickStartGuide } from "@app/components/QuickStartGuide";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import { useBrowserNotification } from "@app/hooks/useBrowserNotification";
import { useDatadogLogs } from "@app/hooks/useDatadogLogs";
import { useSendNotification } from "@app/hooks/useNotification";
import { useNovuClient } from "@app/hooks/useNovuClient";
import config from "@app/lib/api/config";
import { useAuth } from "@app/lib/auth/AuthContext";
import { ConversationsUpdatedEvent } from "@app/lib/notifications/events";
import { Head, Script, useAppRouter } from "@app/lib/platform";
import { getFaviconPath } from "@app/lib/utils";
import type { Novu } from "@novu/js";
import type React from "react";
import { useEffect } from "react";

export default function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { push } = useAppRouter();
  const { user } = useAuth();
  const { novuClient } = useNovuClient();
  useDatadogLogs();
  const faviconPath = getFaviconPath();
  const sendNotification = useSendNotification();

  useEffect(() => {
    if (typeof window !== "undefined" && user?.sId) {
      // Identify the user with GTM
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        userId: user.sId,
        event: "userIdentified",
      });

      // Identify the user with Common Room
      if (window.signals) {
        window.signals.identify({
          email: user.email,
          name: user.fullName,
        });
      }
    }
  }, [user?.email, user?.fullName, user?.sId]);

  const { allowBrowserNotification, notify } = useBrowserNotification();

  useEffect(() => {
    const setupNotifications = async (novuClient: Novu) => {
      const dustFacingUrl = config.getApiBaseUrl();

      const unsubscribe = novuClient.on(
        "notifications.notification_received",
        (notification) => {
          if (
            notification.result.tags?.includes("conversations") &&
            window !== undefined
          ) {
            if (
              window.location.pathname !==
                notification.result.primaryAction?.redirect?.url ||
              !window.document.hasFocus()
            ) {
              // If we are not already on the conversation page, dispatch the event to update the conversations list.
              window.dispatchEvent(new ConversationsUpdatedEvent());
            }
          }

          if (!allowBrowserNotification) {
            sendNotification({
              title: notification.result.subject ?? "New notification",
              description: notification.result.body
                .replaceAll("\n", " ")
                .trim(),
              type: "success",
            });
          }

          if (
            !notification.result.data?.skipPushNotification &&
            allowBrowserNotification
          ) {
            notify(notification.result.subject ?? "New notification", {
              body: notification.result.body.replaceAll("\n", " ").trim(),
              tag: notification.result.id,
              icon:
                notification.result.avatar ??
                `${dustFacingUrl}/static/landing/logos/dust/Dust_LogoSquare.svg`,
              onClick: async () => {
                if (notification.result.primaryAction?.redirect) {
                  const url = notification.result.primaryAction.redirect.url;
                  const startWithDustDomain = url.startsWith(dustFacingUrl);
                  const isRelativeUrl =
                    url.startsWith("/") && !url.startsWith("//");

                  if (startWithDustDomain || isRelativeUrl) {
                    await push(url);
                  }
                }
              },
            });
          }

          // If the notification has the autoDelete flag, delete the notification immediately after it is received.
          if (notification.result.data?.autoDelete) {
            void novuClient.notifications.delete({
              notificationId: notification.result.id,
            });
          }
        }
      );
      return { unsubscribe };
    };
    if (novuClient) {
      try {
        const result = setupNotifications(novuClient);

        return () => {
          void result.then((result) => {
            result?.unsubscribe();
          });
        };
      } catch (error) {
        console.error("Failed to setup notifications", { error });
      }
    }
  }, [allowBrowserNotification, notify, novuClient, push, sendNotification]);

  return (
    <ThemeProvider>
      <WelcomeTourGuideProvider>
        <DesktopNavigationProvider>
          <InputBarProvider>
            <Head>
              <link rel="icon" type="image/png" href={faviconPath} />

              <meta name="apple-mobile-web-app-title" content="Dust" />
              <link rel="apple-touch-icon" href="/static/AppIcon.png" />
              <link
                rel="apple-touch-icon"
                sizes="60x60"
                href="/static/AppIcon_60.png"
              />
              <link
                rel="apple-touch-icon"
                sizes="76x76"
                href="/static/AppIcon_76.png"
              />
              <link
                rel="apple-touch-icon"
                sizes="120x120"
                href="/static/AppIcon_120.png"
              />
              <link
                rel="apple-touch-icon"
                sizes="152x152"
                href="/static/AppIcon_152.png"
              />
              <link
                rel="apple-touch-icon"
                sizes="167x167"
                href="/static/AppIcon_167.png"
              />
              <link
                rel="apple-touch-icon"
                sizes="180x180"
                href="/static/AppIcon_180.png"
              />
              <link
                rel="apple-touch-icon"
                sizes="192x192"
                href="/static/AppIcon_192.png"
              />
              <link
                rel="apple-touch-icon"
                sizes="228x228"
                href="/static/AppIcon_228.png"
              />

              <meta
                name="viewport"
                content="width=device-width, initial-scale=1, maximum-scale=1"
              />
            </Head>
            {children}
            <QuickStartGuide />
            <Script id="google-tag-manager" strategy="afterInteractive">
              {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_TRACKING_ID}');
          `}
            </Script>
          </InputBarProvider>
        </DesktopNavigationProvider>
      </WelcomeTourGuideProvider>
    </ThemeProvider>
  );
}
