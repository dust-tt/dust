import { AlertCircle, Check, cn, Icon, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface DocumentSaveStatusProps {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  autosaveDebounceMs: number;
  onRetry?: () => Promise<void>;
  /** Rendered at the left of the row, the status staying at the right. */
  badge?: ReactNode;
}

export const STATUS_ROW_CLASS_NAME =
  "mb-6 flex min-h-6 items-center justify-end gap-2.5 text-muted-foreground copy-xs data-[state=error]:text-foreground print:hidden";

type SaveState = "error" | "saving" | "pending" | "saved";

const SAVE_STATES: Record<SaveState, { label: string; icon: ReactNode }> = {
  error: {
    label: "Not saved",
    icon: <Icon visual={AlertCircle} size="xs" className="text-warning-500" />,
  },
  saving: { label: "Saving…", icon: <Spinner size="xs" /> },
  pending: {
    label: "Changes pending",
    icon: <span className="mx-1 size-1 rounded-full bg-current" />,
  },
  saved: { label: "Saved", icon: <Icon visual={Check} size="xs" /> },
};

function saveState({
  dirty,
  saving,
  error,
}: Pick<DocumentSaveStatusProps, "dirty" | "saving" | "error">): SaveState {
  if (error) {
    return "error";
  }
  if (saving) {
    return "saving";
  }
  if (dirty) {
    return "pending";
  }
  return "saved";
}

export const DocumentSaveStatus = ({
  dirty,
  saving,
  error,
  autosaveDebounceMs,
  onRetry,
  badge,
}: DocumentSaveStatusProps) => {
  const state = saveState({ dirty, saving, error });
  const { icon, label } = SAVE_STATES[state];

  return (
    <>
      <div className={STATUS_ROW_CLASS_NAME} data-state={state}>
        {badge && <span className="mr-auto">{badge}</span>}
        <span
          role="status"
          className="inline-flex items-center gap-1.5"
          title={
            onRetry
              ? `Changes save automatically after ${autosaveDebounceMs / 1_000}s of inactivity`
              : undefined
          }
        >
          <span aria-hidden="true" className="inline-flex items-center">
            {icon}
          </span>
          {label}
        </span>
        {error && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "rounded-md border border-border bg-background px-2 py-0.5 text-foreground transition-colors hover:bg-hover motion-reduce:transition-none",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            Retry
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="-mt-2 mb-6 rounded-lg border border-border bg-muted-background px-4 py-3 text-foreground copy-sm print:hidden"
        >
          {error}
        </p>
      )}
    </>
  );
};
