import type { LiveStatus } from "@app/components/editor/document/types";
import type { LiveAgentEvent } from "@app/lib/client/live_agents";
import type { LiveAgentActivity } from "@app/types/collab";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  AlertCircle,
  Check,
  CheckCircle,
  Chip,
  cn,
  Icon,
  RefreshCw05,
  Spinner,
  Tooltip,
  ZapOff,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ComponentType, ReactNode } from "react";

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
  // Only its controls take clicks, so the text scrolling under the row stays clickable.
  <div className="pointer-events-none sticky top-0 z-30 p-1 mb-5 flex min-h-6 items-center justify-end gap-2.5 text-muted-foreground copy-xs print:hidden [&>*]:pointer-events-auto">
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

const LIVE_AGENT_ACTIVITIES: Record<
  LiveAgentActivity,
  {
    label: MessageDescriptor;
    describe: (name: string) => MessageDescriptor;
  }
> = {
  reading: {
    label: msg`reading…`,
    describe: (name) => msg`${name} is reading`,
  },
  editing: {
    label: msg`writing…`,
    describe: (name) => msg`${name} is writing`,
  },
};

interface DocumentLiveAgentProps {
  activity: LiveAgentEvent;
  avatar: ReactNode;
}

/** The agent at work in a live document: its avatar and what it does, with its name on hover. */
export const DocumentLiveAgent = ({
  activity,
  avatar,
}: DocumentLiveAgentProps) => {
  const { t } = useLingui();
  const { name } = activity.agent;
  const { label, describe } = LIVE_AGENT_ACTIVITIES[activity.activity];
  return (
    <Tooltip
      tooltipTriggerAsChild
      label={name}
      trigger={
        <span
          role="status"
          aria-label={t(describe(name))}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-muted-foreground copy-sm"
        >
          {avatar}
          <span aria-hidden="true">{t(label)}</span>
        </span>
      }
    />
  );
};

type StatusIconState = "saved" | "saving" | "disconnected" | "error";

const STATUS_ICONS: Record<
  StatusIconState,
  { icon: ComponentType<{ className?: string }>; className?: string }
> = {
  saved: { icon: CheckCircle, className: "text-success-500" },
  saving: {
    icon: RefreshCw05,
    className: "animate-spin text-orange-500 motion-reduce:animate-none",
  },
  disconnected: { icon: ZapOff, className: "text-warning-500" },
  error: { icon: AlertCircle, className: "text-warning-500" },
};

/** The icon state and its label: the live session's when live, the file's saves otherwise. */
const statusIcon = ({
  live,
  dirty,
  saving,
  error,
}: {
  live?: { status: LiveStatus; syncing: boolean };
  dirty: boolean;
  saving: boolean;
  error: string | null;
}): { state: StatusIconState; label: MessageDescriptor } => {
  if (live) {
    switch (live.status) {
      case "connecting":
        return { state: "saving", label: msg`Connecting…` };
      case "offline":
        return { state: "disconnected", label: msg`Reconnecting…` };
      case "refused":
        return { state: "disconnected", label: msg`Live editing unavailable` };
      case "live":
        return live.syncing
          ? { state: "saving", label: msg`Saving…` }
          : { state: "saved", label: msg`Saved` };
      default:
        assertNeverAndIgnore(live.status);
        return { state: "disconnected", label: msg`Live editing unavailable` };
    }
  }
  const { label } = SAVE_STATES[saveState({ dirty, saving, error })];
  if (error) {
    return { state: "error", label };
  }
  return { state: saving || dirty ? "saving" : "saved", label };
};

interface DocumentStatusIconProps {
  live?: { status: LiveStatus; syncing: boolean };
  editable: boolean;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onRetry?: () => Promise<void>;
}

/**
 * @cc [owner:tdraier,label:product] document-status-icon
 * Shown next to the host's file name instead of the status badge, the document's status MUST be
 * one icon with its state as label and tooltip: a green check once saved, or once live with every
 * change synced; an orange spinning arrow circle while saving, while changes wait to save or sync,
 * or while connecting; a red disconnected icon when the live session is lost or refused; a warning
 * icon with Retry when a save failed. A file document that is neither editable nor holding unsaved changes
 * MUST show no icon.
 */
export const DocumentStatusIcon = ({
  live,
  editable,
  dirty,
  saving,
  error,
  onRetry,
}: DocumentStatusIconProps) => {
  const { t } = useLingui();
  const saveError = useSaveError({ editable, dirty, saving, error });
  if (!live && !showsSaveStatus({ editable, dirty, saving, error })) {
    return null;
  }
  const { state, label } = statusIcon({
    live,
    dirty,
    saving,
    error: saveError,
  });
  const { icon, className } = STATUS_ICONS[state];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground copy-xs">
      <Tooltip
        label={t(label)}
        tooltipTriggerAsChild
        trigger={
          <span role="status" data-state={state} className="inline-flex">
            <Icon visual={icon} size="sm" className={className} />
            <span className="sr-only">{t(label)}</span>
          </span>
        }
      />
      {state === "error" && editable && onRetry && (
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
    </span>
  );
};

interface DocumentSaveState {
  editable: boolean;
  dirty: boolean;
  saving: boolean;
  error: string | null;
}

/** The save failure, or why saving is unavailable once editability is lost with unsaved changes. */
const useSaveError = ({
  editable,
  dirty,
  saving,
  error,
}: DocumentSaveState) => {
  const { t } = useLingui();
  return !editable && dirty && !saving
    ? t`Saving is unavailable. Your unsaved changes are still here. Copy them before reopening.`
    : error;
};

const showsSaveStatus = ({ editable, dirty, saving }: DocumentSaveState) =>
  editable || dirty || saving;

/**
 * @cc [owner:tdraier,label:product] document-save-error
 * While the save status shows, the save error's full reason MUST show here, under the status row.
 */
export const DocumentSaveError = (props: DocumentSaveState) => {
  const saveError = useSaveError(props);
  return (
    showsSaveStatus(props) &&
    saveError && (
      <p
        role="alert"
        className="-mt-2 mb-6 rounded-lg border border-border bg-muted-background px-4 py-3 text-foreground copy-sm print:hidden"
      >
        {saveError}
      </p>
    )
  );
};

interface DocumentStatusProps extends DocumentSaveState {
  /** False when the host shows the save status elsewhere, as `DocumentStatusIcon`. */
  withSaveStatus: boolean;
  autosaveDebounceMs: number;
  onRetry: () => Promise<void>;
  /** Statuses shown in the badge after the save status, such as the live status. */
  children?: ReactNode;
  /** Shown next to the badge, such as the comments button. */
  controls?: ReactNode;
  /** Shown at the start of the row, apart from the statuses. */
  badge?: ReactNode;
}

/** The status row with the save status and the host's controls; `DocumentSaveError` goes under it. */
/**
 * @cc [owner:tdraier,label:product] document-status-placement
 * The save status with its Retry, unless `withSaveStatus` is false, and the statuses given as
 * children MUST show in a badge above the document that stays in view while the document scrolls,
 * with the given controls next to it and the given `badge` at the start of the row.
 */
export const DocumentStatus = ({
  editable,
  dirty,
  saving,
  error,
  withSaveStatus,
  autosaveDebounceMs,
  onRetry,
  children,
  controls,
  badge,
}: DocumentStatusProps) => {
  const saveError = useSaveError({ editable, dirty, saving, error });
  const showSaveStatus =
    withSaveStatus && showsSaveStatus({ editable, dirty, saving, error });

  if (!showSaveStatus && !children && !controls && !badge) {
    return null;
  }
  return (
    <StatusRow>
      {badge && <div className="mr-auto flex">{badge}</div>}
      {(showSaveStatus || children) && (
        <Chip size="xs" className="gap-2.5 border border-border bg-background">
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
        </Chip>
      )}
      {controls}
    </StatusRow>
  );
};
