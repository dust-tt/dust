import datadogLogger from "@app/logger/datadogLogger";
import type { NotificationType } from "@dust-tt/sparkle";
import { useSendNotification as useSendNotificationWithoutLogging } from "@dust-tt/sparkle";
import { useCallback } from "react";

export const useSendNotification = (disableLogging: boolean = false) => {
  const sendNotification = useSendNotificationWithoutLogging();

  return useCallback(
    (notification: NotificationType) => {
      if (notification.type === "error" && !disableLogging) {
        datadogLogger.info(`UI error notification: ${notification.title}`, {
          notification,
        });
      }
      sendNotification(notification);
    },
    [disableLogging, sendNotification]
  );
};
