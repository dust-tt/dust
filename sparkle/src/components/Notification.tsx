import { Transition } from "@headlessui/react";
import React, { useEffect } from "react";
import { createPortal } from "react-dom";

import { CheckCircleIcon, XCircleIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

const NOTIFICATION_DELAY = 5000;

export type NotificationType = {
  title?: string;
  description?: string;
  type: "success" | "error";
};

const NotificationsContext = React.createContext<(n: NotificationType) => void>(
  (n) => n
);
export interface NotificationProps {
  className?: string;
  description?: string;
  title?: string;
  variant: "success" | "error";
  onClick?: () => void;
}

export function Notification({
  description,
  title,
  variant,
  onClick,
  className = "",
}: NotificationProps) {
  return (
    <div
      className={cn(
        "s-pointer-events-auto s-flex s-max-w-[400px] s-flex-row s-items-center s-gap-2 s-rounded-xl s-border",
        "dark:s-border-structure-100-night s-border-structure-100",
        "dark:s-bg-structure-0-night s-bg-structure-0",
        "s-p-4",
        "s-shadow-xl",
        className
      )}
      onClick={onClick}
    >
      {variant === "success" ? (
        <Icon
          size="lg"
          visual={CheckCircleIcon}
          className="dark:s-text-success-500-night s-pt-0.5 s-text-success-500"
        />
      ) : (
        <Icon
          size="lg"
          visual={XCircleIcon}
          className="dark:s-text-warning-500-night s-pt-0.5 s-text-warning-500"
        />
      )}

      <div className="s-flex s-flex-col">
        <div className="s-flex s-grow s-flex-row s-gap-6">
          <div
            className={cn(
              "s-text-md s-line-clamp-1 s-h-6 s-grow s-font-semibold",
              variant === "success"
                ? "dark:s-text-success-500-night s-text-success-500"
                : "dark:s-text-warning-500-night s-text-warning-500"
            )}
          >
            {title || variant}
          </div>
        </div>
        {description && (
          <div
            className={cn(
              "dark:s-text-element-700-night s-text-element-700",
              "s-line-clamp-3 s-pr-2 s-text-sm s-font-normal"
            )}
          >
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationWithTransition({
  title,
  description,
  type,
}: NotificationType) {
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
      enter="s-transition s-ease-in-out s-duration-300 s-transform"
      enterFrom="s-translate-y-16 s-opacity-0"
      enterTo="s-translate-y-0 s-opacity-100"
      leave="s-transition s-ease-in-out s-duration-300 s-transform"
      leaveFrom="s-translate-y-0 s-opacity-100"
      leaveTo="s-translate-y-16 s-opacity-0"
    >
      <Notification
        variant={type}
        description={description}
        title={title}
        onClick={() => setShowNotification(false)}
      />
    </Transition>
  );
}

function NotificationsList({
  notifications,
}: {
  notifications: (NotificationType & { id: string })[];
}) {
  return (
    <div className="s-pointer-events-none s-fixed s-bottom-0 s-right-0 s-z-60 s-w-96">
      <div className="s-flex s-flex-col s-items-center s-justify-center s-gap-4 s-p-4">
        {notifications.map((n) => {
          return (
            <NotificationWithTransition
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

Notification.Area = ({ children }: { children: React.ReactNode }) => {
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
    <NotificationsContext.Provider value={sendNotification}>
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
    </NotificationsContext.Provider>
  );
};

export const useSendNotification = () => React.useContext(NotificationsContext);
