import { Icon } from "@sparkle/components/Icon";
import { Spinner } from "@sparkle/components/Spinner";
import { AlertCircle, Check } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React from "react";

interface DocumentSaveStatusProps {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  autosaveDebounceMs: number;
  onRetry?: () => Promise<void>;
  /** Controls shown after the status, such as the comments toggle. */
  children?: React.ReactNode;
}

export const DocumentSaveStatus = ({
  dirty,
  saving,
  error,
  autosaveDebounceMs,
  onRetry,
  children,
}: DocumentSaveStatusProps) => (
  <>
    <div
      className="mb-6 flex min-h-6 items-center justify-end gap-2.5 text-muted-foreground copy-xs data-[state=error]:text-foreground print:hidden"
      data-state={
        error ? "error" : saving ? "saving" : dirty ? "pending" : "saved"
      }
    >
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
          {error ? (
            <Icon visual={AlertCircle} size="xs" className="text-warning-500" />
          ) : saving ? (
            <Spinner size="xs" />
          ) : dirty ? (
            <span className="mx-1 size-1 rounded-full bg-current" />
          ) : (
            <Icon visual={Check} size="xs" />
          )}
        </span>
        {error
          ? "Not saved"
          : saving
            ? "Saving…"
            : dirty
              ? "Changes pending"
              : "Saved"}
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
      {children}
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
