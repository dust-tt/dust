import { useBrowserNotification } from "@app/hooks/useBrowserNotification";
import { useSendNotification } from "@app/hooks/useNotification";
import { useNovuClient } from "@app/hooks/useNovuClient";
import config from "@app/lib/api/config";
import { ConversationsUpdatedEvent } from "@app/lib/notifications/events";
import { useAppRouter } from "@app/lib/platform";
import type { Novu } from "@novu/js";
import { useEffect } from "react";

export const useSetupNotifications = () => {
  const { push } = useAppRouter();
  const { novuClient } = useNovuClient();
  const sendNotification = useSendNotification();
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
};
