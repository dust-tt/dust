import React from "react";
import { toast, Toaster } from "sonner";

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

function NotificationContent({ type, title, description }: NotificationType) {
  return (
    <div
      className={cn(
        "s-pointer-events-auto s-flex s-max-w-[400px] s-flex-row s-items-center s-gap-2 s-rounded-xl s-border",
        "s-border-structure-100 dark:s-border-structure-100-night",
        "s-bg-structure-0 dark:s-bg-structure-0-night",
        "s-p-4 s-shadow-xl"
      )}
    >
      {type === "success" ? (
        <Icon
          size="lg"
          visual={CheckCircleIcon}
          className="s-pt-0.5 s-text-success-500 dark:s-text-success-500-night"
          aria-hidden="true"
        />
      ) : (
        <Icon
          size="lg"
          visual={XCircleIcon}
          className="s-pt-0.5 s-text-warning-500 dark:s-text-warning-500-night"
          aria-hidden="true"
        />
      )}
      <div className="s-flex s-flex-col">
        <div
          className={cn(
            "s-text-md s-line-clamp-1 s-h-6 s-grow s-font-semibold",
            type === "success"
              ? "s-text-success-500 dark:s-text-success-500-night"
              : "s-text-warning-500 dark:s-text-warning-500-night"
          )}
        >
          {title || type}
        </div>
        {description && (
          <div
            className={cn(
              "s-text-element-700 dark:s-text-element-700-night",
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

export const Notification = {
  Area: ({ children }: { children: React.ReactNode }) => {
    const sendNotification = React.useCallback(
      (notification: NotificationType) => {
        toast.custom(
          () => (
            <NotificationContent
              type={notification.type}
              title={notification.title}
              description={notification.description}
            />
          ),
          {
            duration: NOTIFICATION_DELAY,
          }
        );
      },
      []
    );

    return (
      <NotificationsContext.Provider value={sendNotification}>
        {children}
        <Toaster
          toastOptions={{
            className: cn(
              "s-transition-all s-duration-300",
              "data-[state=open]:s-animate-in data-[state=closed]:s-animate-out",
              "data-[swipe=move]:s-translate-x-[var(--toast-swipe-move-x)]",
              "data-[state=closed]:s-fade-out-80 data-[state=closed]:s-slide-out-to-right-full",
              "data-[state=open]:s-slide-in-from-right-full"
            ),
          }}
          className="s-flex s-flex-col s-items-end"
          duration={NOTIFICATION_DELAY}
          visibleToasts={9}
          closeButton={false}
          expand={false}
          invert={false}
        />
      </NotificationsContext.Provider>
    );
  },
};

export const useSendNotification = () => React.useContext(NotificationsContext);
