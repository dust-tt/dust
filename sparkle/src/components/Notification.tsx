import { cva } from "class-variance-authority";
import React from "react";
import { toast, Toaster } from "sonner";

import {
  BellIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@sparkle/icons/app";
import { assertNever } from "@sparkle/lib/internal_utils";
import { cn } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

const NOTIFICATION_DELAY = 3000;

export type NotificationType = {
  title?: string;
  description?: string;
  type: "success" | "error" | "info" | "hello";
};

const NotificationsContext = React.createContext<(n: NotificationType) => void>(
  (n) => n,
);

const notificationVariants = cva("", {
  variants: {
    type: {
      success: "s-text-success-600 dark:s-text-success-600-night",
      error: "s-text-warning-600 dark:s-text-warning-600-night",
      info: "s-text-info-700 dark:s-text-info-700-night",
      hello: "s-text-primary-700 dark:s-text-highlight-700-night",
    },
  },
});

const notificationIconBgVariants = cva(
  "s-h-8 s-w-8 s-flex s-items-center s-justify-center s-rounded-lg s-shrink-0",
  {
    variants: {
      type: {
        success: "s-bg-success-100 dark:s-bg-success-100-night",
        error: "s-bg-warning-100 dark:s-bg-warning-100-night",
        info: "s-bg-info-100 dark:s-bg-info-100-night",
        hello: "s-bg-primary-100 dark:s-bg-primary-100-night",
      },
    },
  },
);

export function NotificationContent({
  type,
  title,
  description,
  onDismiss,
}: NotificationType & { onDismiss?: () => void }) {
  const icon = (() => {
    switch (type) {
      case "success":
        return CheckCircleIcon;
      case "error":
        return XCircleIcon;
      case "info":
        return InformationCircleIcon;
      case "hello":
        return BellIcon;
      default:
        assertNever(type);
    }
  })();

  return (
    <div
      className={cn(
        "s-pointer-events-auto s-flex s-max-w-[400px] s-flex-row s-items-start s-gap-2 s-rounded-2xl s-border",
        "s-border-border dark:s-border-border-night",
        "s-bg-background dark:s-bg-background-night s-shadow-md s-backdrop-blur-sm",
        "s-cursor-pointer s-p-2 s-pb-3 s-pr-3 s-transition-colors hover:s-bg-muted/50 dark:hover:s-bg-muted-night/50 s-border-border/50 dark:s-border-border-night/50",
      )}
      onClick={onDismiss}
    >
      <div className={notificationIconBgVariants({ type })}>
        <Icon
          size="sm"
          visual={icon}
          className={notificationVariants({ type })}
          aria-hidden="true"
        />
      </div>

      <div className="s-flex s-min-w-0 s-flex-grow s-flex-col">
        <div
          className={cn(
            "s-heading-base s-line-clamp-1 s-pt-1",
            notificationVariants({ type }),
          )}
        >
          {title || type}
        </div>
        {description && (
          <div
            className={cn(
              "s-text-muted-foreground dark:s-text-muted-foreground-night",
              "s-line-clamp-3 s-text-sm s-font-normal",
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
          (t) => (
            <NotificationContent
              type={notification.type}
              title={notification.title}
              description={notification.description}
              onDismiss={() => toast.dismiss(t)}
            />
          ),
          {
            duration: NOTIFICATION_DELAY,
          },
        );
      },
      [],
    );

    return (
      <NotificationsContext.Provider value={sendNotification}>
        {children}
        <Toaster
          toastOptions={{
            className: cn(
              "s-transition-all s-duration-300 s-select-none",
              "data-[state=open]:s-animate-in data-[state=closed]:s-animate-out",
              "data-[swipe=move]:s-translate-x-[var(--toast-swipe-move-x)]",
              "data-[swipe=move]:s-translate-y-[var(--toast-swipe-move-y)]",
              "data-[state=closed]:s-fade-out-80 data-[state=closed]:s-slide-out-to-right-full",
              "data-[state=open]:s-slide-in-from-right-full",
            ),
          }}
          className="s-flex s-flex-col s-items-end"
          duration={NOTIFICATION_DELAY}
          visibleToasts={9}
          closeButton={false}
          expand={false}
          invert={false}
          swipeDirections={["right"]}
        />
      </NotificationsContext.Provider>
    );
  },
};

export const useSendNotification = () => React.useContext(NotificationsContext);
