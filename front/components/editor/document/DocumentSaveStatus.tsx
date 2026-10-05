import { AlertCircle, Check, cn, Icon, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface DocumentSaveStatusProps {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  autosaveDebounceMs: number;
  onRetry?: () => Promise<void>;
}

type SaveState = "error" | "saving" | "pending" | "saved";

interface StatusRowProps {
  /** Rendered at the left of the row, the controls staying at the right. */
  badge?: ReactNode;
  /** The row's controls, side by side: the save status, the comments toggle. */
  children?: ReactNode;
}

/** The row above the document: the host's badge at the left, the controls at the right. */
export const StatusRow = ({ badge, children }: StatusRowProps) => (
  <div className="mb-6 flex min-h-6 items-center justify-end gap-2.5 text-muted-foreground copy-xs print:hidden">
    {badge && <span className="mr-auto">{badge}</span>}
    {children}
  </div>
);

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
}: DocumentSaveStatusProps) => {
  const state = saveState({ dirty, saving, error });
  const { icon, label } = SAVE_STATES[state];

  return (
    <>
      <span
        role="status"
        data-state={state}
        className="inline-flex items-center gap-1.5 data-[state=error]:text-foreground"
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
    </>
  );
};

interface DocumentSaveErrorProps {
  error: string;
}

/** The save failure, in full under the status row. */
export const DocumentSaveError = ({ error }: DocumentSaveErrorProps) => (
  <p
    role="alert"
    className="-mt-2 mb-6 rounded-lg border border-border bg-muted-background px-4 py-3 text-foreground copy-sm print:hidden"
  >
    {error}
  </p>
);

interface DocumentStatusProps {
  editable: boolean;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  autosaveDebounceMs: number;
  onRetry: () => Promise<void>;
  badge?: ReactNode;
  children?: ReactNode;
}

/** The status row with the save status and the host's controls, and the save error under it. */
export const DocumentStatus = ({
  editable,
  dirty,
  saving,
  error,
  autosaveDebounceMs,
  onRetry,
  badge,
  children,
}: DocumentStatusProps) => {
  const showSaveStatus = editable || dirty || saving;
  const saveError =
    !editable && dirty && !saving
      ? "Saving is unavailable. Your unsaved changes are still here. Copy them before reopening."
      : error;

  if (!showSaveStatus && !badge && !children) {
    return null;
  }
  return (
    <>
      <StatusRow badge={badge}>
        {showSaveStatus && (
          <DocumentSaveStatus
            dirty={dirty}
            saving={saving}
            error={saveError}
            onRetry={editable ? onRetry : undefined}
            autosaveDebounceMs={autosaveDebounceMs}
          />
        )}
        {children}
      </StatusRow>
      {showSaveStatus && saveError && <DocumentSaveError error={saveError} />}
    </>
  );
};
