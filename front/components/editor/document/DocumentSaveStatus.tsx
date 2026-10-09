import type { LiveStatus } from "@app/components/editor/document/types";
import { AlertCircle, Check, cn, Icon, Spinner } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
  /** The row's controls, side by side: the save status, the comments toggle. */
  children?: ReactNode;
}

/** The row above the document, its controls at the right, kept in view while the document scrolls. */
const StatusRow = ({ children }: StatusRowProps) => (
  <div className="sticky top-0 z-30 mb-5 flex min-h-6 items-center justify-end gap-2.5 bg-background py-1 text-muted-foreground copy-xs print:hidden">
    {children}
  </div>
);

const SAVE_STATES: Record<
  SaveState,
  { label: MessageDescriptor; icon: ReactNode }
> = {
  error: {
    label: msg`Not saved`,
    icon: <Icon visual={AlertCircle} size="xs" className="text-warning-500" />,
  },
  saving: { label: msg`Saving…`, icon: <Spinner size="xs" /> },
  pending: {
    label: msg`Changes pending`,
    icon: <span className="mx-1 size-1 rounded-full bg-current" />,
  },
  saved: { label: msg`Saved`, icon: <Icon visual={Check} size="xs" /> },
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
  const { t } = useLingui();
  const state = saveState({ dirty, saving, error });
  const { icon, label } = SAVE_STATES[state];
  const autosaveDebounceSeconds = autosaveDebounceMs / 1_000;

  return (
    <>
      <span
        role="status"
        data-state={state}
        className="inline-flex items-center gap-1.5 data-[state=error]:text-foreground"
        title={
          onRetry
            ? t`Changes save automatically after ${autosaveDebounceSeconds}s of inactivity`
            : undefined
        }
      >
        <span aria-hidden="true" className="inline-flex items-center">
          {icon}
        </span>
        {t(label)}
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
          <Trans>Retry</Trans>
        </button>
      )}
    </>
  );
};

const LIVE_STATES: Record<
  LiveStatus,
  { label: MessageDescriptor; icon: ReactNode }
> = {
  connecting: { label: msg`Connecting…`, icon: <Spinner size="xs" /> },
  live: {
    label: msg`Live`,
    icon: <span className="mx-1 size-1.5 rounded-full bg-success-500" />,
  },
  offline: { label: msg`Reconnecting…`, icon: <Spinner size="xs" /> },
  refused: {
    label: msg`Live editing unavailable`,
    icon: <Icon visual={AlertCircle} size="xs" className="text-warning-500" />,
  },
};

interface DocumentLiveStatusProps {
  status: LiveStatus;
}

/** Where the live session stands, in place of the save status. */
export const DocumentLiveStatus = ({ status }: DocumentLiveStatusProps) => {
  const { t } = useLingui();
  const { icon, label } = LIVE_STATES[status];
  return (
    <span
      role="status"
      data-state={status}
      className="inline-flex items-center gap-1.5 data-[state=refused]:text-foreground"
    >
      <span aria-hidden="true" className="inline-flex items-center">
        {icon}
      </span>
      {t(label)}
    </span>
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
  children?: ReactNode;
}

/** The status row with the save status and the host's controls, and the save error under it. */
/**
 * @cc [owner:tdraier,label:product] document-status-placement
 * The save status with its Retry and the controls given as children MUST show in a row above the
 * document that stays in view while the document scrolls, and the save error's full reason MUST
 * show under that row.
 */
export const DocumentStatus = ({
  editable,
  dirty,
  saving,
  error,
  autosaveDebounceMs,
  onRetry,
  children,
}: DocumentStatusProps) => {
  const { t } = useLingui();
  const showSaveStatus = editable || dirty || saving;
  const saveError =
    !editable && dirty && !saving
      ? t`Saving is unavailable. Your unsaved changes are still here. Copy them before reopening.`
      : error;

  if (!showSaveStatus && !children) {
    return null;
  }
  return (
    <>
      <StatusRow>
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
