import type { Avatar, Icon } from "@dust-tt/sparkle";
import {
  ActionAtomIcon,
  ActionBrainIcon,
  ActionCloudArrowLeftRightIcon,
  ActionDocumentTextIcon,
  ActionEmotionLaughIcon,
  ActionFrameIcon,
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
  Avatar as SparkleAvatar,
  CommandLineIcon,
  ConfluenceLogo,
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
import type { ComponentProps, ComponentType } from "react";

interface ResourceAvatarProps extends ComponentProps<typeof Avatar> {}

/**
 * As Avatar are not made to support dark/light mode switch, this renders a `Avatar` component for resources icons with support for dark mode.
 * If `iconColor` or `backgroundColor` are not provided, sensible defaults are applied for both light and dark themes.
 */
export function ResourceAvatar({
  iconColor,
  backgroundColor,
  ...props
}: ResourceAvatarProps) {
  return (
    <SparkleAvatar
      iconColor={iconColor ?? "s-text-foreground dark:s-text-foreground-night"}
      backgroundColor={
        backgroundColor ??
        "s-bg-muted-background dark:s-bg-muted-background-night"
      }
      {...props}
    />
  );
}

export const CUSTOM_RESOURCE_ALLOWED = Object.keys(ActionIcons);

export const InternalActionIcons = {
  ActionAtomIcon,
  ActionBrainIcon,
  ActionCloudArrowLeftRightIcon,
  ActionDocumentTextIcon,
  ActionEmotionLaughIcon,
  ActionFrameIcon,
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
  ConfluenceLogo,
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

export type CustomResourceIconType = keyof typeof ActionIcons;

export const isCustomResourceIconType = (
  icon: string
): icon is CustomResourceIconType =>
  CUSTOM_RESOURCE_ALLOWED.includes(icon as CustomResourceIconType);

export type InternalAllowedIconType = keyof typeof InternalActionIcons;

export const isInternalAllowedIcon = (
  icon: string
): icon is InternalAllowedIconType =>
  INTERNAL_ALLOWED_ICONS.includes(icon as InternalAllowedIconType);

export const getAvatarFromIcon = (
  icon: InternalAllowedIconType | CustomResourceIconType,
  size: ComponentProps<typeof Avatar>["size"] = "sm"
) => {
  if (isCustomResourceIconType(icon)) {
    return <ResourceAvatar icon={ActionIcons[icon]} size={size} />;
  }

  return <ResourceAvatar icon={InternalActionIcons[icon]} size={size} />;
};

export const getIcon = (
  icon: InternalAllowedIconType | CustomResourceIconType
): ComponentType<ComponentProps<typeof Icon>> => {
  if (isCustomResourceIconType(icon)) {
    return ActionIcons[icon];
  }

  return InternalActionIcons[icon];
};
