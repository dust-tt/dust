import type { ComponentType } from "react";

import { getAgentById } from "../data/agents";
import { ROW_BADGE_VARIANT } from "../data/rowBadges";
import { AvatarCounter, type AvatarCounterSizeType } from "./AvatarCounter";

interface AgentBadgeAvatarProps {
  agentId: string;
  /** Shown when the agent is gone, so the row still says who ran. */
  fallbackName: string;
  badgeIcon: ComponentType<{ className?: string }>;
  /** Accessible name for the badge — what kind of automation this is. */
  badgeLabel: string;
  size?: AvatarCounterSizeType;
  /** Breathes the avatar, for a run that is still going. */
  busy?: boolean;
}

/**
 * An agent's avatar badged with what set it running. Work nobody asked for is
 * always an agent plus one of those reasons, so every list that shows such work
 * shows both, and shows them the same way.
 */
export function AgentBadgeAvatar({
  agentId,
  fallbackName,
  badgeIcon,
  badgeLabel,
  size = "sm",
  busy = false,
}: AgentBadgeAvatarProps) {
  const agent = getAgentById(agentId);

  return (
    <AvatarCounter
      size={size}
      name={agent?.name ?? fallbackName}
      emoji={agent?.emoji}
      backgroundColor={agent?.backgroundColor}
      badgeIcon={badgeIcon}
      badgeLabel={badgeLabel}
      variant={ROW_BADGE_VARIANT}
      busy={busy}
    />
  );
}
