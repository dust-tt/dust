import { Icon } from "@sparkle/components/Icon";
import { Spinner } from "@sparkle/components/Spinner";
import { AlertCircle, Check } from "@sparkle/icons/v2-stroke";
import { assertNever, cn } from "@sparkle/lib/utils";
import React from "react";
import type { DocumentSaveResult } from "./types";

interface DocumentSaveStatusProps {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  autosaveDebounceMs: number;
  onRetry: () => Promise<DocumentSaveResult>;
}

type SaveState = "error" | "saving" | "pending" | "saved";

const SAVE_LABELS: Record<SaveState, string> = {
  error: "Not saved",
  saving: "Saving…",
  pending: "Changes pending",
  saved: "Saved",
};

const getSaveState = ({
  dirty,
  saving,
  error,
}: Pick<DocumentSaveStatusProps, "dirty" | "saving" | "error">): SaveState => {
  if (error) {
    return "error";
  }
  if (saving) {
    return "saving";
  }
  return dirty ? "pending" : "saved";
};

interface SaveIndicatorProps {
  state: SaveState;
}

const SaveIndicator = ({ state }: SaveIndicatorProps) => {
  switch (state) {
    case "error":
      return (
        <Icon visual={AlertCircle} size="xs" className="text-warning-500" />
      );
    case "saving":
      return <Spinner size="xs" />;
    case "pending":
      return <span className="mx-1 size-1 rounded-full bg-current" />;
    case "saved":
      return <Icon visual={Check} size="xs" />;
    default:
      return assertNever(state);
  }
};

export const DocumentSaveStatus = ({
  dirty,
  saving,
  error,
  autosaveDebounceMs,
  onRetry,
}: DocumentSaveStatusProps) => {
  const state = getSaveState({ dirty, saving, error });

  return (
    <>
      <div
        className="mb-6 flex min-h-6 items-center justify-end gap-2.5 text-muted-foreground copy-xs data-[state=error]:text-foreground print:hidden"
        data-state={state}
      >
        <span
          role="status"
          className="inline-flex items-center gap-1.5"
          title={`Changes save automatically after ${autosaveDebounceMs / 1_000}s of inactivity`}
        >
          <span aria-hidden="true" className="inline-flex items-center">
            <SaveIndicator state={state} />
          </span>
          {SAVE_LABELS[state]}
        </span>
        {error && (
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
