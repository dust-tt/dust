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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./Collapsible";
import { Icon } from "./Icon";

const NOTIFICATION_DELAY_MS = 5000;

export type NotificationType = {
  /** Optional action button shown under the message; clicking it also dismisses the toast. */
  action?: {
    label: string;
    onClick: () => void;
  };
  title?: string;
  description?: string;
  /**
   * Optional raw details (e.g. an error code and the untranslated server message) shown as
   * preformatted text under a collapsed "Details" toggle. Expanding it keeps the toast open until
   * it is dismissed.
   */
  details?: string;
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

function resolveSurface(type: NotificationType["type"]): string {
  switch (type) {
    case "success":
      return "bg-success-50 border-success-200 dark:bg-green-950 dark:border-green-900";
    case "error":
      return "bg-red-50 border-rose-100 dark:bg-red-950 dark:border-red-900";
    case "info":
      return "bg-highlight-50 border-highlight-100 dark:bg-blue-950 dark:border-blue-900";
    case "warning":
      return "bg-orange-50 border-orange-100 dark:bg-golden-950 dark:border-golden-900";
    case "hello":
      return "bg-stone-50 border-stone-150 dark:bg-stone-950 dark:border-stone-800";
    default:
      return assertNever(type);
  }
}

function resolveForeground(type: NotificationType["type"]): string {
  switch (type) {
    case "success":
      return "text-success-800 dark:text-green-100";
    case "error":
      return "text-red-800 dark:text-red-100";
    case "info":
      return "text-highlight-800 dark:text-blue-100";
    case "warning":
      return "text-orange-800 dark:text-golden-100";
    case "hello":
      return "text-stone-800 dark:text-stone-50";
    default:
      return assertNever(type);
  }
}

/**
 * The presentational card of a toast notification: icon, title, description,
 * optional collapsible details, optional action button, and optional dismiss control. Use it directly for
 * inline previews; in product code dispatch toasts with useSendNotification
 * instead.
 * @summary Presentational notification card.
 */
export function NotificationContent({
  type,
  title,
  description,
  details,
  action,
  onDismiss,
  onExpandDetails,
}: NotificationType & {
  onDismiss?: () => void;
  /** Called each time the details are expanded. */
  onExpandDetails?: () => void;
}) {
  const icon = resolveIcon(type);
  const foreground = resolveForeground(type);

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex w-[264px] flex-col gap-2 overflow-clip",
        "rounded-xl border p-3",
        resolveSurface(type),
        "[&>*]:transition-opacity [&>*]:duration-400 [&>*]:ease-enter",
        "[[data-expanded=false][data-front=false]_&>*]:opacity-0"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="mt-[2px] shrink-0">
            <Icon
              visual={icon}
              size="xs"
              className={foreground}
              aria-hidden="true"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && (
              <span className={cn("label-sm", foreground)}>{title}</span>
            )}
            {description && (
              <span className={cn("copy-xs opacity-80", foreground)}>
                {description}
              </span>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              "mt-[2px] shrink-0 cursor-pointer opacity-60 transition-opacity hover:opacity-100",
              foreground
            )}
            aria-label="Dismiss notification"
          >
            <Icon visual={XClose} size="xs" />
          </button>
        )}
      </div>
      {details && (
        <Collapsible
          className="pl-6"
          onOpenChange={(open) => {
            if (open) {
              onExpandDetails?.();
            }
          }}
        >
          <CollapsibleTrigger>
            <span className={cn("copy-xs", foreground)}>Details</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre
              className={cn(
                "copy-xs mt-1 max-h-40 select-text overflow-auto whitespace-pre-wrap break-words font-mono opacity-80",
                foreground
              )}
            >
              {details}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
      {action && (
        <div className="pl-6">
          <Button
            size="xs"
            variant="outline"
            label={action.label}
            onClick={() => {
              action.onClick();
              onDismiss?.();
            }}
          />
        </div>
      )}
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
        const render = (id: string | number) => (
          <NotificationContent
            type={notification.type}
            title={notification.title}
            description={notification.description}
            details={notification.details}
            action={notification.action}
            onDismiss={() => toast.dismiss(id)}
            // Someone reading the details must not lose the toast: update it in place without a
            // dismiss timer.
            onExpandDetails={() =>
              toast.custom(render, { id, duration: Infinity })
            }
          />
        );
        toast.custom(render, { duration: NOTIFICATION_DELAY_MS });
      },
      []
    );

    return (
      <NotificationsContext.Provider value={sendNotification}>
        {children}
        <Toaster
          className="flex flex-col items-end"
          duration={NOTIFICATION_DELAY_MS}
          visibleToasts={3}
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
