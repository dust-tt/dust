import { ActionIcons } from "@dust-tt/sparkle";
import React from "react";

import type { MCPServerType } from "@app/lib/api/mcp";

export const DEFAULT_MCP_SERVER_ICON = "ActionCommand1Icon" as const;

export const ALLOWED_ICONS = Object.keys(ActionIcons);

export type AllowedIconType = keyof typeof ActionIcons;

export const isAllowedIconType = (icon: string): icon is AllowedIconType =>
  ALLOWED_ICONS.includes(icon as AllowedIconType);

export const getVisual = (mcpServer: MCPServerType) => {
  if (isAllowedIconType(mcpServer.visual)) {
    return React.createElement(ActionIcons[mcpServer.visual]);
  }

  return mcpServer.visual;
};
