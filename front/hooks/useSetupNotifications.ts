import { useBrowserNotification } from "@app/hooks/useBrowserNotification";
import { useSendNotification } from "@app/hooks/useNotification";
import { useNovuClient } from "@app/hooks/useNovuClient";
import { useSoundNotification } from "@app/hooks/useSoundNotification";
import config from "@app/lib/api/config";
import { ConversationsUpdatedEvent } from "@app/lib/notifications/events";
import { useAppRouter } from "@app/lib/platform";
import { workspaceAuthContextUrl } from "@app/lib/swr/workspaces";
import {
  MANUAL_ACTION_REQUIRED_TAG,
  PROVIDER_CREDENTIALS_HEALTH_UPDATED_TAG,
} from "@app/types/notification_preferences";
import { isString } from "@app/types/shared/utils/general";
import type { Novu } from "@novu/js";
import { useEffect } from "react";
import { mutate } from "swr";

const isActivelyViewing = (isOnConversationPage: boolean): boolean =>
  isOnConversationPage && window.document.hasFocus();

export const useSetupNotifications = () => {
  const { push } = useAppRouter();
  const { novuClient } = useNovuClient();
  const sendNotification = useSendNotification();
  const { allowBrowserNotification, notify } = useBrowserNotification();
  const { requestManualActionSound } = useSoundNotification();

  useEffect(() => {
    const setupNotifications = async (novuClient: Novu) => {
      const dustFacingUrl = config.getApiBaseUrl();

      const unsubscribe = novuClient.on(
        "notifications.notification_received",
        (notification) => {
          // Silently refresh auth context and skip all user-facing display.
          if (
            notification.result.tags?.includes(
              PROVIDER_CREDENTIALS_HEALTH_UPDATED_TAG
            )
          ) {
            const workspaceId = notification.result.data?.workspaceId;
            if (isString(workspaceId)) {
              void mutate(workspaceAuthContextUrl(workspaceId));
            }
            void novuClient.notifications.delete({
              notificationId: notification.result.id,
            });
            return;
          }

          if (
            notification.result.tags?.includes(MANUAL_ACTION_REQUIRED_TAG) &&
            window !== undefined
          ) {
            const conversationId = notification.result.data?.conversationId;
            if (isString(conversationId)) {
              if (
                !isActivelyViewing(
                  window.location.pathname.includes(conversationId)
                )
              ) {
                requestManualActionSound();
              }
              window.dispatchEvent(new ConversationsUpdatedEvent());
            }
            void novuClient.notifications.delete({
              notificationId: notification.result.id,
            });
            return;
          }

          if (
            notification.result.tags?.includes("conversations") &&
            window !== undefined
          ) {
            if (
              !isActivelyViewing(
                window.location.pathname ===
                  notification.result.primaryAction?.redirect?.url
              )
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
  }, [
    allowBrowserNotification,
    notify,
    novuClient,
    push,
    requestManualActionSound,
    sendNotification,
  ]);
};
