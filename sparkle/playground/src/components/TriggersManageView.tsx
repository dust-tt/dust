import {
  Chip,
  ListGroup,
  ListItem,
  SliderToggle,
  Tooltip,
  Zap,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import { getAgentById } from "../data/agents";
import {
  getTriggerDescription,
  getTriggerIcon,
  TRIGGER_STATUS_LABELS,
} from "../data/triggers";
import type { Trigger } from "../data/types";
import { AvatarCounter } from "./AvatarCounter";
import { EmptyState } from "./EmptyState";

interface AutomationsManageViewProps {
  triggers: Trigger[];
  /** Only the triggers this member owns are theirs to manage. */
  currentUserId?: string;
  onToggleTrigger?: (triggerId: string, enabled: boolean) => void;
}

/** A manager's decision outranks the owner's, so the owner cannot undo it. */
const LOCKED_TOOLTIP = "Disabled by a manager or admin, who can re-enable it.";

function TriggerRow({
  trigger,
  onToggle,
}: {
  trigger: Trigger;
  onToggle?: (enabled: boolean) => void;
}) {
  const agent = getAgentById(trigger.agentId);
  const isEnabled = trigger.status === "enabled";
  const isLocked = trigger.status === "disabled_by_manager";

  const toggle = (
    <SliderToggle
      selected={isEnabled}
      disabled={isLocked}
      onClick={() => onToggle?.(!isEnabled)}
    />
  );

  return (
    <ListItem
      itemsAlignment="center"
      ignorePressSelector="[data-trigger-toggle]"
    >
      <AvatarCounter
        size="sm"
        name={agent?.name ?? trigger.name}
        emoji={agent?.emoji}
        backgroundColor={agent?.backgroundColor}
        badgeIcon={getTriggerIcon(trigger)}
        badgeLabel={trigger.kind === "schedule" ? "Schedule" : "Webhook"}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate heading-sm text-foreground">
            {trigger.name}
          </span>
          {agent && (
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {agent.name}
            </span>
          )}
        </div>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {getTriggerDescription(trigger)}
        </span>
      </div>
      {!isEnabled && (
        <Chip
          size="xs"
          color="primary"
          label={TRIGGER_STATUS_LABELS[trigger.status]}
        />
      )}
      <div data-trigger-toggle>
        {isLocked ? (
          <Tooltip trigger={toggle} label={LOCKED_TOOLTIP} />
        ) : (
          toggle
        )}
      </div>
    </ListItem>
  );
}

/**
 * The triggers the current member owns — the product lists these in its
 * Automations dialog, and only their editor can turn one on or off.
 */
export function AutomationsManageView({
  triggers,
  currentUserId,
  onToggleTrigger,
}: AutomationsManageViewProps) {
  const ownedTriggers = useMemo(() => {
    const owned = currentUserId
      ? triggers.filter((trigger) => trigger.editorId === currentUserId)
      : triggers;

    // The ones still running come first; within each half, the most recently
    // fired, since that is what the member is likeliest to be looking for.
    return [...owned].sort((a, b) => {
      const aEnabled = a.status === "enabled";
      const bEnabled = b.status === "enabled";
      if (aEnabled !== bEnabled) {
        return aEnabled ? -1 : 1;
      }
      return (b.lastRunAt?.getTime() ?? 0) - (a.lastRunAt?.getTime() ?? 0);
    });
  }, [currentUserId, triggers]);

  return (
    <div className="flex h-full w-full flex-col overflow-x-clip overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 pt-6 pb-8">
        {ownedTriggers.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No automations"
            description="You haven't created any automation yet."
          />
        ) : (
          <ListGroup className="border-transparent!">
            {ownedTriggers.map((trigger) => (
              <TriggerRow
                key={trigger.id}
                trigger={trigger}
                onToggle={(enabled) => onToggleTrigger?.(trigger.id, enabled)}
              />
            ))}
          </ListGroup>
        )}
      </div>
    </div>
  );
}
