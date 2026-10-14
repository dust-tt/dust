import type { CollabStatus } from "@app/components/editor/document/types";
import { useDebouncedValue } from "@app/hooks/useDebounce";
import type { AgentEvent } from "@app/lib/client/collab/agents";
import type { AgentActivity } from "@app/types/collab";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  AlertCircle,
  CheckCircle,
  Chip,
  Icon,
  RefreshCw05,
  Spinner,
  Tooltip,
  ZapOff,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { ComponentType, ReactNode } from "react";

interface StatusRowProps {
  /** The row's controls, side by side: the live status, the comments toggle. */
  children?: ReactNode;
}

/** The row above the document, its controls at the right, kept in view while the document scrolls. */
const StatusRow = ({ children }: StatusRowProps) => (
  // Only its controls take clicks, so the text scrolling under the row stays clickable.
  <div className="pointer-events-none sticky top-0 z-30 p-1 mb-5 flex min-h-6 items-center justify-end gap-2.5 text-muted-foreground copy-xs print:hidden [&>*]:pointer-events-auto">
    {children}
  </div>
);

const COLLAB_STATES: Record<
  CollabStatus,
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

interface CollabStatusIndicatorProps {
  status: CollabStatus;
}

/** Where the live session stands. */
export const CollabStatusIndicator = ({
  status,
}: CollabStatusIndicatorProps) => {
  const { t } = useLingui();
  const { icon, label } = COLLAB_STATES[status];
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

const AGENT_ACTIVITIES: Record<
  AgentActivity,
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

interface CollabAgentIndicatorProps {
  activity: AgentEvent;
  avatar: ReactNode;
}

/** The agent at work in a live document: its avatar and what it does, with its name on hover. */
export const CollabAgentIndicator = ({
  activity,
  avatar,
}: CollabAgentIndicatorProps) => {
  const { t } = useLingui();
  const { name } = activity.agent;
  const { label, describe } = AGENT_ACTIVITIES[activity.activity];
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

// Every keystroke waits one round trip to sync: only a longer wait shows as saving.
export const SAVING_DISPLAY_DELAY_MS = 1000;

/**
 * @cc [owner:tdraier,label:product] document-saving-delay
 * Changes MUST show as saving only once they have waited `SAVING_DISPLAY_DELAY_MS` since
 * `syncingSinceMs`, the start of their wait, and MUST stop as soon as they are synced: a wait that
 * ended MUST NOT shorten the next one's delay. A wait already started when the hook mounts shows
 * at once, so it MUST be mounted where the connection starts, not per shared document.
 */
export function useShowSaving(syncingSinceMs: number | null): boolean {
  // The start of the wait, not a boolean: a wait that ended leaves no delay behind for the next.
  const { debouncedValue } = useDebouncedValue(
    syncingSinceMs,
    SAVING_DISPLAY_DELAY_MS
  );
  return syncingSinceMs !== null && debouncedValue === syncingSinceMs;
}

type StatusIconState = "saved" | "saving" | "disconnected";

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
};

/** The icon state and its label, from where the live session stands. */
const statusIcon = ({
  status,
  syncing,
}: {
  status: CollabStatus;
  syncing: boolean;
}): { state: StatusIconState; label: MessageDescriptor } => {
  switch (status) {
    case "connecting":
      return { state: "saving", label: msg`Connecting…` };
    case "offline":
      return { state: "disconnected", label: msg`Reconnecting…` };
    case "refused":
      return { state: "disconnected", label: msg`Live editing unavailable` };
    case "live":
      return syncing
        ? { state: "saving", label: msg`Saving…` }
        : { state: "saved", label: msg`Saved` };
    default:
      return assertNever(status);
  }
};

interface DocumentStatusIconProps {
  live?: { status: CollabStatus; syncing: boolean };
}

/**
 * @cc [owner:tdraier,label:product] document-status-icon
 * Shown next to the host's file name instead of the status badge, a live document's status MUST
 * be one icon with its state as label and tooltip: a green check once live, unless changes show
 * as saving (`document-saving-delay`); an orange spinning arrow circle while they do, or while
 * connecting; a red disconnected icon when the live session is lost or refused. A document without
 * a live session MUST show no icon.
 */
export const DocumentStatusIcon = ({ live }: DocumentStatusIconProps) => {
  const { t } = useLingui();
  if (!live) {
    return null;
  }
  const { state, label } = statusIcon(live);
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
    </span>
  );
};

interface DocumentStatusProps {
  /** Statuses shown in the badge, such as the live status. */
  children?: ReactNode;
  /** Shown next to the badge, such as the comments button. */
  controls?: ReactNode;
  /** Shown at the start of the row, apart from the statuses. */
  badge?: ReactNode;
}

/** The status row with the statuses and the host's controls. */
/**
 * @cc [owner:tdraier,label:product] document-status-placement
 * The statuses given as children MUST show in a badge above the document that stays in view while
 * the document scrolls, with the given controls next to it and the given `badge` at the start of
 * the row.
 */
export const DocumentStatus = ({
  children,
  controls,
  badge,
}: DocumentStatusProps) => {
  if (!children && !controls && !badge) {
    return null;
  }
  return (
    <StatusRow>
      {badge && <div className="mr-auto flex">{badge}</div>}
      {children && (
        <Chip size="xs" className="gap-2.5 border border-border bg-background">
          {children}
        </Chip>
      )}
      {controls}
    </StatusRow>
  );
};
