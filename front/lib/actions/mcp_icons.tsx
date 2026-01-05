import type { Avatar } from "@dust-tt/sparkle";
import type { ComponentProps } from "react";

import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import type { MCPServerType } from "@app/lib/api/mcp";

// Re-export from the backend-safe constants file
export { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/mcp_icons_constants";

// MCP-specific function
export const getAvatar = (
  mcpServer: MCPServerType,
  size: ComponentProps<typeof Avatar>["size"] = "sm"
) => {
  return getAvatarFromIcon(mcpServer.icon, size);
};
