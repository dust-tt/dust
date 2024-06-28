import { Notification as SparkleNotification } from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { classNames } from "@app/lib/utils";

export type NotificationType = {
  title?: string;
  description?: string;
  type: "success" | "error";
};

export const SendNotificationsContext = React.createContext<
  (n: NotificationType) => void
>((n) => n);

const NOTIFICATION_DELAY = 5000;

export function NotificationArea({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = React.useState<
    (NotificationType & { id: string })[]
  >([]);

  function sendNotification(n: NotificationType) {
    const id = Math.random().toString();
    setNotifications((notifications) => [...notifications, { ...n, id }]);
    /* After a delay allowing for the notification exit animation, remove the
    notification from the list */
    setTimeout(() => {
      setNotifications((notifications) =>
        notifications.filter((n) => n.id !== id)
      );
    }, NOTIFICATION_DELAY + 1000);
  }

  return (
    <SendNotificationsContext.Provider value={sendNotification}>
      {children}
      {
        /** Notifications are created at DOM root via a Portal. This is to avoid
         * them being made inert by headlessUI modals */
        typeof window === "object" ? (
          createPortal(
            <NotificationsList notifications={notifications} />,
            document.body
          )
        ) : (
          <NotificationsList notifications={notifications} />
        ) // SSR (otherwise hydration issues)
      }
    </SendNotificationsContext.Provider>
  );
}
export function NotificationsList({
  notifications,
}: {
  notifications: (NotificationType & { id: string })[];
}) {
  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-60 w-96">
      <div className="flex flex-col items-center justify-center gap-4 p-4">
        {notifications.map((n) => {
          return (
            <Notification
              key={n.id}
              title={n.title}
              description={n.description}
              type={n.type}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Notification({ title, description, type }: NotificationType) {
  const [showNotification, setShowNotification] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowNotification(false);
    }, NOTIFICATION_DELAY);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Transition show={showNotification} appear={true}>
      <div
        className={classNames(
          "transform transition ease-in-out",
          "data-[enter]:duration-300",
          "data-[enter]:data-[closed]:translate-y-16 data-[enter]:data-[closed]:opacity-0",
          "data-[enter]:data-[open]:translate-y-0 data-[enter]:data-[open]:opacity-100",
          "data-[leave]:duration-300",
          "data-[leave]:data-[open]:translate-y-0 data-[leave]:data-[open]:opacity-100",
          "data-[leave]:data-[closed]:translate-y-16 data-[leave]:data-[closed]:opacity-0"
        )}
      >
        <SparkleNotification
          variant={type}
          description={description}
          title={title}
          onClick={() => setShowNotification(false)}
        />
      </div>
    </Transition>
  );
}
