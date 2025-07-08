import { datadogLogs } from "@datadog/browser-logs";
import type { NotificationType } from "@dust-tt/sparkle";
import { useSendNotification as useSendNotificationWithoutLogging } from "@dust-tt/sparkle";
import { useCallback } from "react";

export const useSendNotification = () => {
  const sendNotification = useSendNotificationWithoutLogging();

  return useCallback(
    (notification: NotificationType) => {
      datadogLogs.logger.info("Notification sent", {
        notification,
      });
      sendNotification(notification);
    },
    [sendNotification]
  );
};
