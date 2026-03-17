import { useNovuClient } from "@app/hooks/useNovuClient";
import type { Novu } from "@novu/js";
import { useCallback, useEffect, useState } from "react";

export interface InboxNotification {
  id: string;
  subject?: string;
  body: string;
  primaryAction?: {
    redirect?: {
      url: string;
    };
  };
  tags?: string[];
  createdAt: string;
  data?: Record<string, unknown>;
}

const ADMIN_TAG = "admin";

async function fetchNotifications(
  novuClient: Novu
): Promise<InboxNotification[]> {
  const result = await novuClient.notifications.list({
    tags: [ADMIN_TAG],
    read: false,
    limit: 20,
  });

  return result.data?.notifications ?? [];
}

export function useInboxNotifications() {
  const { novuClient } = useNovuClient();
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);

  const refresh = useCallback(async () => {
    if (!novuClient) {
      return;
    }
    const items = await fetchNotifications(novuClient);
    setNotifications(items);
  }, [novuClient]);

  useEffect(() => {
    if (!novuClient) {
      return;
    }

    void refresh();

    // Listen for real-time notification updates.
    const unsubReceived = novuClient.on(
      "notifications.notification_received",
      () => {
        void refresh();
      }
    );

    const unsubListUpdated = novuClient.on("notifications.list.updated", () => {
      void refresh();
    });

    return () => {
      unsubReceived();
      unsubListUpdated();
    };
  }, [novuClient, refresh]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!novuClient) {
        return;
      }
      await novuClient.notifications.read({ notificationId });
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    },
    [novuClient]
  );

  return { notifications, markAsRead };
}
