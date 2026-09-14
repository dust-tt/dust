import {
  describeWakeUpSchedule,
  getNextWakeUpFireAtFromScheduleConfig,
} from "@app/lib/utils/wakeup_description";
import { usePokeConversationWakeUps } from "@app/poke/swr/conversation_wakeups";
import type { WakeUpStatus, WakeUpType } from "@app/types/assistant/wakeups";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import type { ComponentProps } from "react";

type ChipColor = NonNullable<ComponentProps<typeof Chip>["color"]>;

function getWakeUpStatusColor(status: WakeUpStatus): ChipColor {
  switch (status) {
    case "scheduled":
      return "highlight";
    case "fired":
      return "success";
    case "cancelled":
      return "primary";
    case "expired":
      return "warning";
    default:
      assertNeverAndIgnore(status);
      return "primary";
  }
}

interface WakeUpFieldProps {
  label: string;
  value: string;
  mono?: boolean;
}

function WakeUpField({ label, value, mono }: WakeUpFieldProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span
        className={
          mono
            ? "min-w-0 truncate font-mono text-xs tabular-nums text-foreground"
            : "min-w-0 truncate text-xs text-foreground"
        }
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

interface WakeUpEntryProps {
  wakeUp: WakeUpType;
}

function WakeUpEntry({ wakeUp }: WakeUpEntryProps) {
  // Only a still-scheduled wake-up has a firing ahead of it; for terminal ones the cron parser
  // would happily keep projecting future dates that will never happen.
  const nextFireAt =
    wakeUp.status === "scheduled"
      ? getNextWakeUpFireAtFromScheduleConfig(wakeUp.scheduleConfig)
      : null;

  return (
    <div className="flex flex-col gap-1.5 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-medium text-foreground">
          {wakeUp.reason}
        </span>
        <Chip
          color={getWakeUpStatusColor(wakeUp.status)}
          label={wakeUp.status}
          size="mini"
        />
      </div>
      <WakeUpField label="schedule" value={describeWakeUpSchedule(wakeUp)} />
      {wakeUp.scheduleConfig.type === "cron" && (
        <>
          <WakeUpField label="cron" value={wakeUp.scheduleConfig.cron} mono />
          <WakeUpField
            label="timezone"
            value={wakeUp.scheduleConfig.timezone}
          />
        </>
      )}
      {nextFireAt !== null && (
        <WakeUpField
          label="next fire"
          value={new Date(nextFireAt).toLocaleString()}
          mono
        />
      )}
      <WakeUpField
        label="fires"
        value={`${wakeUp.fireCount} / ${wakeUp.maxFires}`}
        mono
      />
      <WakeUpField label="owner" value={wakeUp.user.fullName} />
      <WakeUpField label="agent" value={wakeUp.agentConfigurationId} mono />
      <WakeUpField label="id" value={wakeUp.sId} mono />
      <WakeUpField
        label="created"
        value={new Date(wakeUp.createdAt).toLocaleString()}
        mono
      />
    </div>
  );
}

interface PokeConversationWakeUpsInspectorProps {
  conversationId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  owner: LightWorkspaceType;
}

export function PokeConversationWakeUpsInspector({
  conversationId,
  isOpen,
  onOpenChange,
  owner,
}: PokeConversationWakeUpsInspectorProps) {
  const { wakeUps, isWakeUpsError, isWakeUpsLoading } =
    usePokeConversationWakeUps({
      conversationId,
      disabled: !isOpen,
      owner,
    });

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className="overflow-hidden rounded-xl border border-border bg-background"
    >
      <CollapsibleTrigger className="min-h-11 w-full gap-2 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center">
            <span className="text-sm font-semibold text-foreground">
              Wake-ups
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground xl:whitespace-nowrap">
            Agent-scheduled wake-ups for this conversation, in any status.
          </p>
        </div>
        {isWakeUpsLoading && <Spinner size="xs" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border">
        {isWakeUpsError ? (
          <p role="alert" className="p-4 text-sm text-warning">
            Wake-ups could not be loaded.
          </p>
        ) : isWakeUpsLoading ? (
          <div className="flex min-h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : wakeUps.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No wake-up was ever scheduled in this conversation.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {wakeUps.map((wakeUp) => (
              <WakeUpEntry key={wakeUp.sId} wakeUp={wakeUp} />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
