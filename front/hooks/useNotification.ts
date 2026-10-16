import { errorNotification } from "@app/lib/api_error_messages";
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

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling;react] send-api-error-notification
 * The returned function MUST send `errorNotification(title, error)`.
 */
export const useSendApiErrorNotification = () => {
  const sendNotification = useSendNotification();

  return useCallback(
    ({ title, error }: { title: string; error: unknown }) => {
      sendNotification(errorNotification(title, error));
    },
    [sendNotification]
  );
};
