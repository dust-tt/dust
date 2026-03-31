import { DustLogoSquareMonoWhite } from "@dust-tt/sparkle";

import type { Agent } from "./types";

const DUST_AVATAR_BACKGROUND =
  "s-bg-primary-800 dark:s-bg-primary-800-night" as const;

/** Avatar props for playground agents; Dust uses the product logo on primary-800. */
export function getAgentAvatarProps(agent: Agent) {
  if (agent.id === "agent-dust") {
    return {
      name: agent.name,
      visual: (
        <DustLogoSquareMonoWhite className="s-h-[55%] s-w-[55%] s-shrink-0" />
      ),
      backgroundColor: DUST_AVATAR_BACKGROUND,
      isRounded: false as const,
    };
  }

  return {
    name: agent.name,
    emoji: agent.emoji,
    backgroundColor: agent.backgroundColor,
    isRounded: false as const,
  };
}
