import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { Avatar } from "@dust-tt/sparkle";
import type { ComponentProps } from "react";

// MCP-specific function
export const getAvatar = (
  mcpServer: MCPServerType,
  size: ComponentProps<typeof Avatar>["size"] = "sm"
) => {
  return getAvatarFromIcon(mcpServer.icon, size);
};
