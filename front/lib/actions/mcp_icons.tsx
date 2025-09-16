import type { Icon } from "@dust-tt/sparkle";
import {
  ActionBrainIcon,
  ActionCloudArrowLeftRightIcon,
  ActionDocumentTextIcon,
  ActionEmotionLaughIcon,
  ActionGitBranchIcon,
  ActionGlobeAltIcon,
  ActionIcons,
  ActionImageIcon,
  ActionLightbulbIcon,
  ActionLockIcon,
  ActionMagnifyingGlassIcon,
  ActionPieChartIcon,
  ActionRobotIcon,
  ActionScanIcon,
  ActionSlideshowIcon,
  ActionTableIcon,
  ActionTimeIcon,
  AsanaLogo,
  Avatar,
  CommandLineIcon,
  DriveLogo,
  FreshserviceLogo,
  GcalLogo,
  GithubLogo,
  GmailLogo,
  GoogleSpreadsheetLogo,
  HubspotLogo,
  JiraLogo,
  LinearLogo,
  MondayLogo,
  NotionLogo,
  OpenaiLogo,
  OutlookLogo,
  SalesforceLogo,
  SlackLogo,
  StripeLogo,
} from "@dust-tt/sparkle";
import type React from "react";
import type { ComponentProps, ComponentType } from "react";

import type { MCPServerType } from "@app/lib/api/mcp";

export const DEFAULT_MCP_SERVER_ICON = "ActionCommand1Icon" as const;

export const CUSTOM_SERVER_ALLOWED = Object.keys(ActionIcons);

export const InternalActionIcons = {
  ActionBrainIcon,
  ActionCloudArrowLeftRightIcon,
  ActionDocumentTextIcon,
  ActionEmotionLaughIcon,
  ActionGitBranchIcon,
  ActionGlobeAltIcon,
  ActionImageIcon,
  ActionLightbulbIcon,
  ActionLockIcon,
  ActionMagnifyingGlassIcon,
  ActionRobotIcon,
  ActionScanIcon,
  ActionTableIcon,
  ActionPieChartIcon,
  ActionSlideshowIcon,
  ActionTimeIcon,
  AsanaLogo,
  CommandLineIcon,
  GcalLogo,
  GithubLogo,
  GmailLogo,
  GoogleSpreadsheetLogo,
  FreshserviceLogo,
  HubspotLogo,
  OutlookLogo,
  JiraLogo,
  LinearLogo,
  MondayLogo,
  NotionLogo,
  OpenaiLogo,
  SalesforceLogo,
  SlackLogo,
  StripeLogo,
  DriveLogo,
};

export const INTERNAL_ALLOWED_ICONS = Object.keys(InternalActionIcons);

export type CustomServerIconType = keyof typeof ActionIcons;

export const isCustomServerIconType = (
  icon: string
): icon is CustomServerIconType =>
  CUSTOM_SERVER_ALLOWED.includes(icon as CustomServerIconType);

export type InternalAllowedIconType = keyof typeof InternalActionIcons;

export const isInternalAllowedIcon = (
  icon: string
): icon is InternalAllowedIconType =>
  INTERNAL_ALLOWED_ICONS.includes(icon as InternalAllowedIconType);

export const getAvatar = (
  mcpServer: MCPServerType,
  size: ComponentProps<typeof Avatar>["size"] = "sm"
) => {
  return getAvatarFromIcon(mcpServer.icon, size);
};

export const getAvatarFromIcon = (
  icon: InternalAllowedIconType | CustomServerIconType,
  size: ComponentProps<typeof Avatar>["size"] = "sm"
) => {
  if (isCustomServerIconType(icon)) {
    return <Avatar icon={ActionIcons[icon]} size={size} />;
  }

  return <Avatar icon={InternalActionIcons[icon]} size={size} />;
};

export const getIcon = (
  icon: InternalAllowedIconType | CustomServerIconType
): ComponentType<ComponentProps<typeof Icon>> => {
  if (isCustomServerIconType(icon)) {
    return ActionIcons[icon];
  }

  return InternalActionIcons[icon];
};
