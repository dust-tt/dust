import {
  AlertCircle,
  Bell01,
  CheckCircle,
  InfoCircle,
  XCircle,
  XClose,
} from "@sparkle/icons/v2-stroke";
import { assertNever } from "@sparkle/lib/internal_utils";
import { cn } from "@sparkle/lib/utils";
import React from "react";
import { Toaster, toast } from "sonner";

import { Button } from "./Button";
import { Icon } from "./Icon";

const NOTIFICATION_DELAY_MS = 5000;

const VISIBLE_NOTIFICATIONS = 3;

export type NotificationType = {
  /** Optional action button shown under the message; clicking it also dismisses the toast. */
  action?: {
    label: string;
    onClick: () => void;
  };
  title?: string;
  description?: string;
  /** Outcome variant driving the icon and its color. */
  type: "success" | "error" | "info" | "warning" | "hello";
};

const NotificationsContext = React.createContext<(n: NotificationType) => void>(
  (n) => n
);

function resolveIcon(type: NotificationType["type"]): React.FC {
  switch (type) {
    case "success":
      return CheckCircle;
    case "error":
      return XCircle;
    case "info":
      return InfoCircle;
    case "warning":
      return AlertCircle;
    case "hello":
      return Bell01;
    default:
      return assertNever(type);
  }
}

function resolveIconColor(type: NotificationType["type"]): string {
  switch (type) {
    case "success":
      return "text-success-500";
    case "error":
      return "text-warning-500";
    case "info":
      return "text-primary-400";
    case "warning":
      return "text-info-500";
    case "hello":
      return "text-primary-400";
    default:
      return assertNever(type);
  }
}

/**
 * The presentational card of a toast notification: icon, title, description,
 * optional action button, and optional dismiss control. Use it directly for
 * inline previews; in product code dispatch toasts with useSendNotification
 * instead.
 * @summary Presentational notification card.
 */
export function NotificationContent({
  type,
  title,
  description,
  action,
  onDismiss,
}: NotificationType & { onDismiss?: () => void }) {
  const icon = resolveIcon(type);
  const iconColor = resolveIconColor(type);

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex w-[264px] flex-col overflow-clip",
        "rounded-xl bg-primary p-3",
        "shadow-[inset_0px_1px_4px_0px_rgba(255,255,255,0.10)]",
        "dark:shadow-none"
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-2",
          "transition-opacity duration-400 ease-enter",
          "[[data-expanded=false][data-front=false]_&]:opacity-0"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className="mt-[2px] shrink-0">
              <Icon
                visual={icon}
                size="xs"
                className={iconColor}
                aria-hidden="true"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              {title && (
                <span className="label-sm text-primary-50">{title}</span>
              )}
              {description && (
                <span className="copy-xs text-primary-400">{description}</span>
              )}
            </div>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="mt-[2px] shrink-0 cursor-pointer text-primary-200 transition-colors hover:text-primary-50"
              aria-label="Dismiss notification"
            >
              <Icon visual={XClose} size="xs" />
            </button>
          )}
        </div>
        {action && (
          <div className="pl-6">
            <Button
              size="xs"
              variant="ghost"
              label={action.label}
              className="text-primary-50 hover:bg-white/10 active:bg-white/10 dark:hover:bg-black/[0.06] dark:active:bg-black/[0.06]"
              onClick={() => {
                action.onClick();
                onDismiss?.();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A transient toast system that confirms the outcome of an action. Mount a
 * single Notification.Area near the app root, then dispatch toasts
 * imperatively with the useSendNotification hook. Use it for brief,
 * self-dismissing feedback after an action completes; for persistent, inline
 * status attached to a region, use ContentMessage instead.
 * @summary Toast notifications dispatched via hook.
 */
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
              action={notification.action}
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
          visibleToasts={VISIBLE_NOTIFICATIONS}
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

/**
 * Returns the function that dispatches a toast notification, provided by the
 * nearest Notification.Area.
 * @summary Hook to dispatch toast notifications.
 */
export const useSendNotification = () => React.useContext(NotificationsContext);
