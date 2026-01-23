import { useCallback, useMemo } from "react";

type BrowserNotificationOptions = NotificationOptions & {
  onClick?: () => Promise<void>;
};

interface UseBrowserNotificationApi {
  allowBrowserNotification: boolean;
  notify: (title: string, options?: BrowserNotificationOptions) => void;
}

// This hook provides a thin wrapper around the Web Notifications API. It handles permission
// requests and ensures that notifications are only attempted in supported environments.
export function useBrowserNotification(): UseBrowserNotificationApi {
  const allowBrowserNotification = useMemo(() => {
    return (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    );
  }, []);

  const notify = useCallback(
    (title: string, options?: BrowserNotificationOptions) => {
      // Guard against non-browser environments or unsupported APIs.
      if (!allowBrowserNotification) {
        return;
      }

      // If permission is already granted, show the notification.
      if (Notification.permission === "granted") {
        try {
          const n = new Notification(title, options);

          // Focus the window when the notification is clicked.
          n.onclick = async () => {
            window.focus();
            n.close();

            // Call the onClick callback if provided.
            await options?.onClick?.();
          };
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) {
          // Silently ignore errors to avoid noisy logs as per logging policy.
        }
        return;
      }

      // If denied, do nothing.
    },
    [allowBrowserNotification]
  );

  return { allowBrowserNotification, notify };
}
