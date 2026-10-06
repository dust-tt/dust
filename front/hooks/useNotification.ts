import { errorNotification } from "@app/lib/api_error_messages";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
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
 * The returned function MUST send `errorNotification(title, error, { hasLocalisation })`, with
 * `hasLocalisation` the `localisation` feature flag of the current workspace.
 */
export const useSendApiErrorNotification = () => {
  const sendNotification = useSendNotification();
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");

  return useCallback(
    ({ title, error }: { title: string; error: unknown }) => {
      sendNotification(errorNotification(title, error, { hasLocalisation }));
    },
    [hasLocalisation, sendNotification]
  );
};
