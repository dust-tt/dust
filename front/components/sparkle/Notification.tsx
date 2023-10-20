import {
  CheckCircleStrokeIcon,
  Icon,
  IconButton,
  XCircleStrokeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import React, { useEffect } from "react";
import { createPortal } from "react-dom";

import { classNames } from "@app/lib/utils";

type NotificationType = {
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
    <div className="z-60 fixed bottom-0 right-0 w-80">
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
  const [showNotification, setShowNotification] = React.useState(true);
  useEffect(() => {
    setTimeout(() => {
      setShowNotification(false);
    }, NOTIFICATION_DELAY);
  }, []);
  return (
    <Transition
      show={showNotification}
      appear={true}
      enter="transition ease-in-out duration-300 transform"
      enterFrom="-translate-y-16 opacity-0"
      enterTo="translate-y-0 opacity-100"
      leave="transition ease-in-out duration-300 transform"
      leaveFrom="translate-y-0 opacity-100"
      leaveTo="-translate-y-16 opacity-0"
    >
      <div className="flex rounded-md border border-structure-100 bg-structure-0 p-2 shadow-md">
        <div>
          {type === "success" ? (
            <Icon
              size="sm"
              visual={CheckCircleStrokeIcon}
              className="text-success-500"
            />
          ) : (
            <Icon
              size="sm"
              visual={XCircleStrokeIcon}
              className="text-warning-500"
            />
          )}
        </div>
        <div className="flex flex-col">
          <div
            className={classNames(
              "text-sm font-semibold capitalize",
              type === "success" ? "text-success-500" : "text-warning-500"
            )}
          >
            {title || type}
          </div>
          <div className="text-xs font-normal capitalize text-element-700">
            {description}
          </div>
        </div>
        <div>
          <IconButton
            icon={XMarkIcon}
            size="xs"
            variant="secondary"
            onClick={() => setShowNotification(false)}
          />
        </div>
      </div>
    </Transition>
  );
}
