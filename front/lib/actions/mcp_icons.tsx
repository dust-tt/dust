import type { Avatar } from "@dust-tt/sparkle";
import type { ComponentProps } from "react";

import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import type { MCPServerType } from "@app/lib/api/mcp";

export const DEFAULT_MCP_SERVER_ICON = "ActionCommand1Icon" as const;

export const getAvatar = (
  mcpServer: MCPServerType,
  size: ComponentProps<typeof Avatar>["size"] = "sm"
) => {
  return getAvatarFromIcon(mcpServer.icon, size);
};
