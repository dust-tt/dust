import { useCallback } from "react";

interface BrowserNotificationOptions {
  body?: string;
  icon?: string;
  tag?: string;
}

interface UseBrowserNotificationApi {
  notify: (title: string, options?: BrowserNotificationOptions) => void;
}

// This hook provides a thin wrapper around the Web Notifications API. It handles permission
// requests and ensures that notifications are only attempted in supported environments.
export function useBrowserNotification(): UseBrowserNotificationApi {
  const notify = useCallback(
    (title: string, options?: BrowserNotificationOptions) => {
      // Guard against non-browser environments or unsupported APIs.
      if (
        typeof window === "undefined" ||
        typeof Notification === "undefined"
      ) {
        return;
      }

      // Do not send a system notification if the page is currently visible and focused. As an example, this implies
      // that the conversation is on screen and the user can already see the outcome.
      if (typeof document !== "undefined") {
        const hasFocus =
          typeof document.hasFocus === "function" ? document.hasFocus() : true;
        if (document.visibilityState === "visible" && hasFocus) {
          return;
        }
      }

      const show = () => {
        try {
          const n = new Notification(title, {
            body: options?.body,
            icon: options?.icon,
            tag: options?.tag,
          });

          // Focus the window when the notification is clicked.
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch (_) {
          // Silently ignore errors to avoid noisy logs as per logging policy.
        }
      };

      // If permission is already granted, show the notification immediately.
      if (Notification.permission === "granted") {
        show();
        return;
      }

      // If the permission is not denied, request it once and show if granted.
      if (Notification.permission !== "denied") {
        void Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            show();
          }
        });
      }
      // If denied, do nothing.
    },
    []
  );

  return { notify };
}
