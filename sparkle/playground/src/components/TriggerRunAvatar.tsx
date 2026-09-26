import { INBOX_ROW_BADGES } from "../data/rowBadges";
import type { Trigger } from "../data/types";
import { AgentBadgeAvatar } from "./AgentBadgeAvatar";
import type { AvatarCounterSizeType } from "./AvatarCounter";

interface TriggerRunAvatarProps {
  trigger: Trigger;
  size?: AvatarCounterSizeType;
  /** Breathes the avatar, for a run that is still going. */
  busy?: boolean;
}

/**
 * The agent that runs a trigger, badged as automated work. What made it fire
 * is the trigger's own business, told where triggers are managed; in a list of
 * work it is enough to know nobody asked for this one.
 */
export function TriggerRunAvatar({
  trigger,
  size = "sm",
  busy = false,
}: TriggerRunAvatarProps) {
  return (
    <AgentBadgeAvatar
      agentId={trigger.agentId}
      fallbackName={trigger.name}
      badgeIcon={INBOX_ROW_BADGES.automated.icon}
      badgeLabel={INBOX_ROW_BADGES.automated.label}
      size={size}
      busy={busy}
    />
  );
}
