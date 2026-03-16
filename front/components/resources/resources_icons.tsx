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
  ActionMegaphoneIcon,
  ActionNoiseIcon,
  ActionPieChartIcon,
  ActionRobotIcon,
  ActionScanIcon,
  ActionSlideshowIcon,
  ActionSpeakIcon,
  ActionTableIcon,
  ActionTimeIcon,
  AsanaLogo,
  AshbyLogo,
  AttioLogo,
  BigQueryLogo,
  CanvaLogo,
  CommandLineIcon,
  ConfluenceLogo,
  DriveLogo,
  FathomLogo,
  FreshserviceLogo,
  FrontLogo,
  GcalLogo,
  GithubLogo,
  GitlabLogo,
  GmailLogo,
  GongLogo,
  GoogleSpreadsheetLogo,
  GranolaLogo,
  GuruLogo,
  HubspotLogo,
  IntercomLogo,
  JiraLogo,
  LinearLogo,
  MicrosoftExcelLogo,
  MicrosoftLogo,
  MicrosoftOutlookLogo,
  MicrosoftTeamsLogo,
  MiroLogo,
  MondayLogo,
  NotionLogo,
  OpenaiLogo,
  ProductboardLogo,
  PuzzleIcon,
  SalesforceLogo,
  SalesloftLogo,
  SemrushLogo,
  SlabLogo,
  SlackLogo,
  SnowflakeLogo,
  Avatar as SparkleAvatar,
  StatuspageLogo,
  StripeLogo,
  SupabaseLogo,
  ToolsIcon,
  UkgLogo,
  ValTownLogo,
  VantaLogo,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import type { ComponentProps, ComponentType } from "react";

// Re-export icon names, types, and type guards from the sparkle-free module so
// that existing imports from this file continue to work.
export type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icon_names";
export {
  CUSTOM_RESOURCE_ALLOWED,
  INTERNAL_ALLOWED_ICONS,
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icon_names";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icon_names";
import { isCustomResourceIconType } from "@app/components/resources/resources_icon_names";

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
      iconColor={iconColor ?? "text-foreground dark:text-foreground-night"}
      backgroundColor={
        backgroundColor ?? "bg-muted-background dark:bg-muted-background-night"
      }
      {...props}
    />
  );
}

// Compile-time check: ensure CUSTOM_RESOURCE_ALLOWED matches ActionIcons keys.
// If ActionIcons gains or loses a key, this assignment will fail to compile.
const _customCheck: Record<CustomResourceIconType, unknown> = ActionIcons;
void _customCheck;

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
  ActionMegaphoneIcon,
  ActionNoiseIcon,
  ActionPieChartIcon,
  ActionRobotIcon,
  ActionScanIcon,
  ActionSlideshowIcon,
  ActionSpeakIcon,
  ActionTableIcon,
  ActionTimeIcon,
  AsanaLogo,
  AttioLogo,
  AshbyLogo,
  BigQueryLogo,
  ToolsIcon,
  CanvaLogo,
  CommandLineIcon,
  ConfluenceLogo,
  DriveLogo,
  FathomLogo,
  FreshserviceLogo,
  FrontLogo,
  GcalLogo,
  GithubLogo,
  GitlabLogo,
  GmailLogo,
  GongLogo,
  GoogleSpreadsheetLogo,
  GranolaLogo,
  GuruLogo,
  HubspotLogo,
  IntercomLogo,
  JiraLogo,
  LinearLogo,
  MicrosoftExcelLogo,
  MicrosoftLogo,
  MicrosoftOutlookLogo,
  MicrosoftTeamsLogo,
  MiroLogo,
  MondayLogo,
  NotionLogo,
  OpenaiLogo,
  ProductboardLogo,
  PuzzleIcon,
  SalesforceLogo,
  SemrushLogo,
  SalesloftLogo,
  SlabLogo,
  SlackLogo,
  SnowflakeLogo,
  StatuspageLogo,
  StripeLogo,
  SupabaseLogo,
  UkgLogo,
  ValTownLogo,
  VantaLogo,
  ZendeskLogo,
};

// Compile-time check: ensure INTERNAL_ALLOWED_ICONS matches InternalActionIcons keys.
const _internalCheck: Record<InternalAllowedIconType, unknown> =
  InternalActionIcons;
void _internalCheck;

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
