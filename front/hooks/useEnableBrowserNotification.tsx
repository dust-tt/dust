import { ConfirmContext } from "@app/components/Confirm";
import { useUser } from "@app/lib/swr/user";
import { useCallback, useContext, useMemo, useRef, useState } from "react";

const LOCAL_STORAGE_KEY = "browser-notification-last-asked-for";
const DELAY_BEFORE_ASKING_AGAIN = 1000 * 60 * 60 * 24 * 7; // One week

function getLastAskedTimestamp(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const ts = parseInt(raw, 10);
      return Number.isNaN(ts) ? null : ts;
    }
  } catch {
    // localStorage unavailable.
  }
  return null;
}

function setLastAskedTimestamp(ts: number): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, `${ts}`);
  } catch {
    // localStorage may be full or unavailable — silently ignore.
  }
}

export const useEnableBrowserNotification = () => {
  const { user } = useUser();
  // No subscriberHash means we will not sent notifications to this user.
  // TODO(mentions v2): remove when notifications are released to everyone.
  const notificationsEnabled = useMemo(() => !!user?.subscriberHash, [user]);
  const shownRef = useRef<boolean>(false);
  const confirm = useContext(ConfirmContext);
  const [lastAskedMs, setLastAskedMs] = useState<number | null>(
    getLastAskedTimestamp
  );

  const canAsk = useMemo(() => {
    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "default" ||
      !notificationsEnabled
    ) {
      return false;
    }

    if (lastAskedMs === null) {
      return true;
    }

    return Date.now() - lastAskedMs > DELAY_BEFORE_ASKING_AGAIN;
  }, [notificationsEnabled, lastAskedMs]);

  const askForPermission = useCallback(async () => {
    if (!canAsk || shownRef.current) {
      return;
    }

    // Avoid double rendering of the confirm popup.
    // Couldn't make it work with a simple useState().
    shownRef.current = true;

    const now = Date.now();
    setLastAskedTimestamp(now);
    setLastAskedMs(now);

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
  }, [canAsk, confirm]);

  return { askForPermission };
};
