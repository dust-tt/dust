import {
  Bell01,
  CheckCircle,
  InfoCircle,
  XCircle,
} from "@sparkle/icons/v2-stroke";
import { assertNever } from "@sparkle/lib/internal_utils";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React from "react";
import { Toaster, toast } from "sonner";
import { Icon } from "./Icon";

const NOTIFICATION_DELAY_MS = 5000;

export type NotificationType = {
  title?: string;
  description?: string;
  type: "success" | "error" | "info" | "hello";
};

const NotificationsContext = React.createContext<(n: NotificationType) => void>(
  (n) => n
);

const notificationVariants = cva("", {
  variants: {
    type: {
      success: "text-success-600",
      error: "text-warning-600",
      info: "text-info-700",
      hello: "text-primary-700",
    },
  },
});

const notificationIconBgVariants = cva(
  "h-8 w-8 flex items-center justify-center rounded-lg shrink-0",
  {
    variants: {
      type: {
        success: "bg-success-100",
        error: "bg-warning-100",
        info: "bg-info-100",
        hello: "bg-primary-100",
      },
    },
  }
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
        return CheckCircle;
      case "error":
        return XCircle;
      case "info":
        return InfoCircle;
      case "hello":
        return Bell01;
      default:
        assertNever(type);
    }
  })();

  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-[400px] flex-row items-start gap-2 rounded-2xl border",
        "border-border",
        "bg-background shadow-md backdrop-blur-sm",
        "cursor-pointer p-2 pb-3 pr-3 transition-colors hover:bg-muted/50 border-border/50"
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

      <div className="flex min-w-0 flex-grow flex-col">
        <div
          className={cn(
            "heading-base line-clamp-1 pt-1",
            notificationVariants({ type })
          )}
        >
          {title || type}
        </div>
        {description && (
          <div
            className={cn(
              "text-muted-foreground",
              "line-clamp-3 text-sm font-normal"
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
            duration: NOTIFICATION_DELAY_MS,
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
              "transition-all duration-300 select-none",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[swipe=move]:translate-x-[var(--toast-swipe-move-x)]",
              "data-[swipe=move]:translate-y-[var(--toast-swipe-move-y)]",
              "data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full",
              "data-[state=open]:slide-in-from-right-full"
            ),
          }}
          className="flex flex-col items-end"
          duration={NOTIFICATION_DELAY_MS}
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
