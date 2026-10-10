import {
  INPUT_BAR_COMPACT_PILL_CLASSES,
  INPUT_BAR_COMPACT_PILL_INNER_CLASSES,
  INPUT_BAR_SURFACE_CLASSES,
} from "@app/components/assistant/conversation/input_bar/inputBarCompactStyles";
import { classNames } from "@app/lib/utils";
import { useLingui } from "@lingui/react/macro";
import styles from "./ConversationNavigationPill.module.css";

interface ConversationNavigationPillProps {
  variant: "floating" | "compact";
  showStopButton: boolean;
  showMessageNavigation: boolean;
  stopButtonLabel: string;
  hasPendingMessages: boolean;
  pendingAction: "stop" | "interrupt" | null;
  onStopClick: () => void;
  canScrollUp: boolean;
  canScrollDown: boolean;
  onScrollUp: () => void;
  onScrollDown: () => void;
  responseNavigation: "idle" | "streaming" | "ready";
  onScrollToResponse: () => void;
}

/**
 * @cc [owner:id13,label:react;product] answer-navigation-keeps-target
 * While message navigation is shown, the down button MUST retain its DOM
 * identity across idle, streaming, and ready states, and MUST scroll to the
 * active or unseen answer instead of the next user message when not idle.
 */
export function ConversationNavigationPill({
  variant,
  showStopButton,
  showMessageNavigation,
  stopButtonLabel,
  hasPendingMessages,
  pendingAction,
  onStopClick,
  canScrollUp,
  canScrollDown,
  onScrollUp,
  onScrollDown,
  responseNavigation,
  onScrollToResponse,
}: ConversationNavigationPillProps) {
  const { t } = useLingui();
  const compact = variant === "compact";
  const upLabel = t`Previous user message`;
  const downLabel =
    responseNavigation === "streaming"
      ? t`Jump to latest answer`
      : responseNavigation === "ready"
        ? t`Answer ready, go to bottom`
        : t`Next user message`;

  return (
    <div
      className={classNames(
        "relative flex items-center",
        compact
          ? INPUT_BAR_COMPACT_PILL_CLASSES
          : `absolute -top-8 gap-1 rounded-xl p-1 ${INPUT_BAR_SURFACE_CLASSES}`,
        responseNavigation === "streaming" && styles.streaming
      )}
    >
      <div
        className={classNames(
          "relative flex items-center",
          compact ? INPUT_BAR_COMPACT_PILL_INNER_CLASSES : "gap-1"
        )}
      >
        {showStopButton && (
          <>
            <button
              type="button"
              className={classNames(
                styles.control,
                compact ? "size-6" : "h-6 gap-1.5 px-2"
              )}
              aria-label={compact ? stopButtonLabel : undefined}
              title={compact ? stopButtonLabel : undefined}
              onClick={onStopClick}
              disabled={pendingAction !== null}
            >
              {hasPendingMessages ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-4"
                >
                  <path
                    d="m13 2-9 11h7l-1 9 10-12h-7l1-8Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-4"
                >
                  <rect
                    x="3.5"
                    y="3.5"
                    width="17"
                    height="17"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  />
                </svg>
              )}
              {!compact && (
                <span className="whitespace-nowrap">{stopButtonLabel}</span>
              )}
            </button>
            {showMessageNavigation && (
              <span className="h-4 w-px bg-border" aria-hidden="true" />
            )}
          </>
        )}
        {showMessageNavigation && (
          <>
            <button
              type="button"
              className={classNames(styles.control, "size-6")}
              aria-label={upLabel}
              title={upLabel}
              onClick={onScrollUp}
              disabled={!canScrollUp}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="size-4"
              >
                <path
                  d="M12 20V4m0 0-7 7m7-7 7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className={classNames(styles.control, "size-6")}
              aria-label={downLabel}
              title={downLabel}
              onClick={
                responseNavigation === "idle"
                  ? onScrollDown
                  : onScrollToResponse
              }
              disabled={responseNavigation === "idle" && !canScrollDown}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="size-4"
              >
                <path
                  d="M12 4v16m0 0 7-7m-7 7-7-7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
