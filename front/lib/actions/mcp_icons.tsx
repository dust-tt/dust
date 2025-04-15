import { ActionIcons, GithubLogo } from "@dust-tt/sparkle";
import type React from "react";

import type { MCPServerType } from "@app/lib/api/mcp";

export const DEFAULT_MCP_SERVER_ICON = "ActionCommand1Icon" as const;

export const REMOTE_ALLOWED_ICONS = Object.keys(ActionIcons);

export const InternalActionIcons = {
  GithubLogo,
};

export const INTERNAL_ALLOWED_ICONS = Object.keys(InternalActionIcons);

export type RemoteAllowedIconType = keyof typeof ActionIcons;

export const isRemoteAllowedIconType = (
  icon: string
): icon is RemoteAllowedIconType =>
  typeof icon === "string" &&
  REMOTE_ALLOWED_ICONS.includes(icon as RemoteAllowedIconType);

export type InternalAllowedIconType = keyof typeof InternalActionIcons;

export const isInternalAllowedIcon = (
  icon: string
): icon is InternalAllowedIconType =>
  typeof icon === "string" &&
  INTERNAL_ALLOWED_ICONS.includes(icon as InternalAllowedIconType);

export const getIcon = (
  mcpServer: MCPServerType
): React.ComponentType<{ className?: string }> => {
  if (isRemoteAllowedIconType(mcpServer.icon)) {
    return ActionIcons[mcpServer.icon];
  }

  return InternalActionIcons[mcpServer.icon];
};
