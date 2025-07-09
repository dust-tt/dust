import { cva } from "class-variance-authority";
import React from "react";
import { toast, Toaster } from "sonner";

import {
  CheckCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@sparkle/icons/app";
import { assertNever, cn } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

const NOTIFICATION_DELAY = 5000;

export type NotificationType = {
  title?: string;
  description?: string;
  type: "success" | "error" | "info";
};

const NotificationsContext = React.createContext<(n: NotificationType) => void>(
  (n) => n
);
export interface NotificationProps {
  className?: string;
  description?: string;
  title?: string;
  variant: "success" | "error" | "info";
  onClick?: () => void;
}

function NotificationContent({ type, title, description }: NotificationType) {
  const icon = (() => {
    switch (type) {
      case "success":
        return CheckCircleIcon;
      case "error":
        return XCircleIcon;
      case "info":
        return InformationCircleIcon;
      default:
        assertNever(type);
    }
  })();

  const variantClassName = cva("s-pt-0.5", {
    variants: {
      type: {
        success: "s-text-success-600 dark:s-text-success-400-night",
        error: "s-text-warning-500 dark:s-text-warning-500-night",
        info: "s-text-info-600 dark:s-text-info-400-night",
      },
    },
  });

  return (
    <div
      className={cn(
        "s-pointer-events-auto s-flex s-max-w-[400px] s-flex-row s-items-center s-gap-2 s-rounded-xl s-border",
        "s-border-border dark:s-border-border-night",
        "s-bg-background dark:s-bg-background-night",
        "s-p-4 s-shadow-xl"
      )}
    >
      <Icon
        size="lg"
        visual={icon}
        className={variantClassName({ type })}
        aria-hidden="true"
      />
      <div className="s-flex s-flex-col">
        <div
          className={cn(
            "s-text-md s-line-clamp-1 s-h-6 s-grow s-font-semibold",
            variantClassName({ type })
          )}
        >
          {title || type}
        </div>
        {description && (
          <div
            className={cn(
              "s-text-muted-foreground dark:s-text-muted-foreground-night",
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
