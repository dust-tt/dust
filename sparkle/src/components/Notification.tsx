import {
  AlertCircle,
  Bell01,
  CheckCircle,
  InfoCircle,
  XCircle,
  XClose,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React from "react";
import { Toaster, toast } from "sonner";

import { Icon } from "./Icon";

const NOTIFICATION_DELAY_MS = 5000;

export type NotificationType = {
  title?: string;
  description?: string;
  type: "success" | "error" | "info" | "warning" | "hello";
};

const NotificationsContext = React.createContext<(n: NotificationType) => void>(
  (n) => n
);

const iconMap: Record<NotificationType["type"], React.FC> = {
  success: CheckCircle,
  error: XCircle,
  info: InfoCircle,
  warning: AlertCircle,
  hello: Bell01,
};

const iconColorMap: Record<NotificationType["type"], string> = {
  success: "text-success-500",
  error: "text-warning-500",
  info: "text-info-700",
  warning: "text-amber-500",
  hello: "text-primary-500",
};

export function NotificationContent({
  type,
  title,
  description,
  onDismiss,
}: NotificationType & { onDismiss?: () => void }) {
  const icon = iconMap[type];
  const iconColor = iconColorMap[type];

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex w-[246px] flex-col overflow-clip",
        "rounded-xl border border-border bg-background p-2",
        "shadow-[0px_0.5px_1px_0px_rgba(0,0,0,0.04),0px_1px_1px_0px_rgba(0,0,0,0.06),inset_2px_-2px_7px_0px_rgba(0,0,0,0.01),inset_0px_4px_4px_0px_rgba(255,255,255,0.08)]",
        "dark:shadow-[0px_2px_8px_0px_rgba(0,0,0,0.45),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)]",
        "dark:border-border-dark",
        "animate-in fade-in-0 zoom-in-95 duration-200 ease-emphasized",
        "origin-bottom-right motion-reduce:animate-none"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex min-w-0 flex-1 items-start gap-1">
          <div className="mt-[2px] shrink-0">
            <Icon
              visual={icon}
              size="xs"
              className={iconColor}
              aria-hidden="true"
            />
          </div>
          <div className="flex min-w-0 flex-col">
            {title && (
              <span className="text-sm font-medium leading-5 tracking-[-0.02em] text-foreground">
                {title}
              </span>
            )}
            {description && (
              <span className="text-xs leading-4 text-muted-foreground">
                {description}
              </span>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="mt-[2px] shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss notification"
          >
            <Icon visual={XClose} size="xs" />
          </button>
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
          className="flex flex-col items-end"
          duration={NOTIFICATION_DELAY_MS}
          visibleToasts={5}
          closeButton={false}
          expand={false}
          invert={false}
          swipeDirections={["right"]}
          toastOptions={{
            unstyled: true,
            className: "w-fit select-none",
          }}
        />
      </NotificationsContext.Provider>
    );
  },
};

export const useSendNotification = () => React.useContext(NotificationsContext);
