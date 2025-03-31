import { CommandLineIcon, RocketIcon } from "@dust-tt/sparkle";

import type { AllowedIconType } from "@app/lib/actions/mcp_actions";

export const MCP_SERVER_ICONS: Record<AllowedIconType, React.ComponentType> = {
  command: CommandLineIcon,
  rocket: RocketIcon,
} as const;
