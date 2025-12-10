import { useCallback, useContext, useMemo, useRef } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { useUser, useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";

const BROWSER_NOTIFICATION_LAST_ASKED_FOR_KEY =
  "browser-notification-last-asked-for";
const DELAY_BEFORE_ASKING_AGAIN = 1000 * 60 * 60 * 24 * 7; // One week

export const useEnableBrowserNotification = () => {
  const { user } = useUser();
  // No subscriberHash means we will not sent notifications to this user.
  // TODO(mentions v2): remove when notifications are released to everyone.
  const notificationsEnabled = useMemo(() => !!user?.subscriberHash, [user]);
  const shownRef = useRef<boolean>(false);
  const confirm = useContext(ConfirmContext);

  const { metadata, isMetadataLoading, mutateMetadata } = useUserMetadata(
    BROWSER_NOTIFICATION_LAST_ASKED_FOR_KEY,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      disabled: !notificationsEnabled,
    }
  );

  const canAsk = useMemo(() => {
    if (
      isMetadataLoading ||
      typeof Notification === "undefined" ||
      Notification.permission !== "default" ||
      !notificationsEnabled
    ) {
      return false;
    }

    if (!metadata) {
      return true;
    }

    // eslint-disable-next-line react-hooks/purity
    const delay = Date.now() - parseInt(metadata.value);

    return delay > DELAY_BEFORE_ASKING_AGAIN;
  }, [isMetadataLoading, metadata, notificationsEnabled]);

  const askForPermission = useCallback(async () => {
    if (!canAsk || shownRef.current) {
      return;
    }

    // Avoid double rendering of the confirm popup.
    // Couldn't make it work with a simple useState().
    shownRef.current = true;

    await setUserMetadataFromClient({
      key: BROWSER_NOTIFICATION_LAST_ASKED_FOR_KEY,
      value: `${Date.now()}`,
    });
    await mutateMetadata((current) => {
      if (current) {
        return {
          ...current,
          value: Date.now(),
        };
      }
      return current;
    });

    const confirmed = await confirm({
      title: (
        <div className="flex items-center gap-2">Enable notifications</div>
      ),
      message: "Get notified in your browser when messages arrive.",
      validateLabel: "Enable",
      cancelLabel: "Later",
    });

    if (confirmed) {
      await Notification.requestPermission();
    }

    shownRef.current = false;
  }, [canAsk, confirm, mutateMetadata]);

  return { askForPermission };
};
