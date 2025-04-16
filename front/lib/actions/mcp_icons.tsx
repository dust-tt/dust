import { Avatar } from "@dust-tt/sparkle";
import { ActionIcons, GithubLogo, LightbulbIcon } from "@dust-tt/sparkle";
import type React from "react";
import type { ComponentProps } from "react";

import type { MCPServerType } from "@app/lib/api/mcp";

export const DEFAULT_MCP_SERVER_ICON = "ActionCommand1Icon" as const;

export const REMOTE_ALLOWED_ICONS = Object.keys(ActionIcons);

export const InternalActionIcons = {
  GithubLogo,
  LightbulbIcon,
};

export const INTERNAL_ALLOWED_ICONS = Object.keys(InternalActionIcons);

export type RemoteAllowedIconType = keyof typeof ActionIcons;

export const isRemoteAllowedIconType = (
  icon: string
): icon is RemoteAllowedIconType =>
  REMOTE_ALLOWED_ICONS.includes(icon as RemoteAllowedIconType);

export type InternalAllowedIconType = keyof typeof InternalActionIcons;

export const isInternalAllowedIcon = (
  icon: string
): icon is InternalAllowedIconType =>
  INTERNAL_ALLOWED_ICONS.includes(icon as InternalAllowedIconType);

export const getAvatar = (
  mcpServer: MCPServerType,
  size: ComponentProps<typeof Avatar>["size"] = "sm"
): React.ReactNode => {
  if (isRemoteAllowedIconType(mcpServer.icon)) {
    return <Avatar icon={ActionIcons[mcpServer.icon]} size={size} />;
  }

  return <Avatar icon={InternalActionIcons[mcpServer.icon]} size={size} />;
};
