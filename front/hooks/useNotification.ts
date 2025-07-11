import { datadogLogs } from "@datadog/browser-logs";
import type { NotificationType } from "@dust-tt/sparkle";
import { useSendNotification as useSendNotificationWithoutLogging } from "@dust-tt/sparkle";
import { useCallback } from "react";

export const useSendNotification = () => {
  const sendNotification = useSendNotificationWithoutLogging();

  return useCallback(
    (notification: NotificationType) => {
      if (notification.type === "error") {
        datadogLogs.logger.info(
          `UI error notification: ${notification.title}`,
          {
            notification,
          }
        );
      }
      sendNotification(notification);
    },
    [sendNotification]
  );
};
