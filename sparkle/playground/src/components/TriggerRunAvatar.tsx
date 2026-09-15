import { getTriggerIcon, TRIGGER_KIND_LABELS } from "../data/triggers";
import type { Trigger } from "../data/types";
import { AgentBadgeAvatar } from "./AgentBadgeAvatar";
import type { AvatarCounterSizeType } from "./AvatarCounter";

interface TriggerRunAvatarProps {
  trigger: Trigger;
  size?: AvatarCounterSizeType;
}

/**
 * The agent that runs a trigger, badged with what makes it fire — a clock for
 * a schedule, the platform's logo for an event.
 */
export function TriggerRunAvatar({
  trigger,
  size = "sm",
}: TriggerRunAvatarProps) {
  return (
    <AgentBadgeAvatar
      agentId={trigger.agentId}
      fallbackName={trigger.name}
      badgeIcon={getTriggerIcon(trigger)}
      badgeLabel={TRIGGER_KIND_LABELS[trigger.kind]}
      size={size}
    />
  );
}
