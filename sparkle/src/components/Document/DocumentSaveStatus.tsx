import { cn } from "@sparkle/lib/utils";
import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import React from "react";

interface DocumentSaveStatusProps {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  autosaveDebounceMs: number;
  onRetry: () => Promise<void>;
}

export const DocumentSaveStatus = ({
  dirty,
  saving,
  error,
  autosaveDebounceMs,
  onRetry,
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
        title={`Changes save automatically after ${autosaveDebounceMs / 1_000}s of inactivity`}
      >
        {error ? (
          <AlertCircle
            size={14}
            className="text-warning-500"
            aria-hidden="true"
          />
        ) : saving ? (
          <LoaderCircle
            size={14}
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : dirty ? (
          <span
            className="mx-1 size-1 rounded-full bg-current"
            aria-hidden="true"
          />
        ) : (
          <Check size={14} aria-hidden="true" />
        )}
        {error
          ? "Not saved"
          : saving
            ? "Saving…"
            : dirty
              ? "Changes pending"
              : "Saved"}
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
