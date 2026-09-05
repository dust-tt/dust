import type { Avatar, Icon } from "@dust-tt/sparkle";
import {
  ActionIcons,
  AmplitudeLogo,
  ApifyLogo,
  AsanaLogo,
  AshbyLogo,
  AttioLogo,
  BigQueryLogo,
  CanvaLogo,
  ClariLogo,
  ConfluenceLogo,
  ContentsquareLogo,
  CostoryLogo,
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
  HexLogo,
  HubspotLogo,
  IntercomLogo,
  JiraLogo,
  LinearLogo,
  LumaLogo,
  MicrosoftExcelLogo,
  MicrosoftLogo,
  MicrosoftOutlookLogo,
  MicrosoftTeamsLogo,
  MiroLogo,
  MondayLogo,
  NaptaLogo,
  NetSuiteLogo,
  NotionLogo,
  OpenaiLogo,
  PowerBiLogo,
  PraizLogo,
  ProductboardLogo,
  PuzzlePiece01,
  SalesforceLogo,
  SalesloftLogo,
  SemrushLogo,
  ShapesPlus,
  SlabLogo,
  SlackLogo,
  SnowflakeLogo,
  Avatar as SparkleAvatar,
  StatuspageLogo,
  StripeLogo,
  SupabaseLogo,
  Terminal,
  TerminalSquare,
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
} from "@marketing/components/resources/resources_icon_names";
export {
  CUSTOM_RESOURCE_ALLOWED,
  INTERNAL_ALLOWED_ICONS,
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@marketing/components/resources/resources_icon_names";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@marketing/components/resources/resources_icon_names";
import { isCustomResourceIconType } from "@marketing/components/resources/resources_icon_names";

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
      iconColor={iconColor ?? "text-foreground"}
      backgroundColor={backgroundColor ?? "bg-muted-background"}
      {...props}
    />
  );
}

// Compile-time check: ensure CUSTOM_RESOURCE_ALLOWED matches ActionIcons keys.
// If ActionIcons gains or loses a key, this assignment will fail to compile.
const _customCheck: Record<CustomResourceIconType, unknown> = ActionIcons;
void _customCheck;

export const InternalActionIcons = {
  ActionAtomIcon: ActionIcons.ActionAtomIcon,
  ActionBrainIcon: ActionIcons.ActionBrainIcon,
  ActionChatBubbleBottomCenterTextIcon:
    ActionIcons.ActionChatBubbleBottomCenterTextIcon,
  ActionChatBubbleThoughtIcon: ActionIcons.ActionChatBubbleThoughtIcon,
  ActionCheckCircleIcon: ActionIcons.ActionCheckCircleIcon,
  ActionCloudArrowLeftRightIcon: ActionIcons.ActionCloudArrowLeftRightIcon,
  ActionDocumentTextIcon: ActionIcons.ActionDocumentTextIcon,
  ActionEmotionLaughIcon: ActionIcons.ActionEmotionLaughIcon,
  ActionFrameIcon: ActionIcons.ActionFrameIcon,
  ActionGitBranchIcon: ActionIcons.ActionGitBranchIcon,
  ActionGlobeAltIcon: ActionIcons.ActionGlobeAltIcon,
  ActionImageIcon: ActionIcons.ActionImageIcon,
  ActionLightbulbIcon: ActionIcons.ActionLightbulbIcon,
  ActionListCheckIcon: ActionIcons.ActionListCheckIcon,
  ActionLockIcon: ActionIcons.ActionLockIcon,
  ActionMagnifyingGlassIcon: ActionIcons.ActionMagnifyingGlassIcon,
  ActionMegaphoneIcon: ActionIcons.ActionMegaphoneIcon,
  ActionNoiseIcon: ActionIcons.ActionNoiseIcon,
  ActionPieChartIcon: ActionIcons.ActionPieChartIcon,
  ActionRobotIcon: ActionIcons.ActionRobotIcon,
  ActionScanIcon: ActionIcons.ActionScanIcon,
  ActionSlideshowIcon: ActionIcons.ActionSlideshowIcon,
  ActionSpeakIcon: ActionIcons.ActionSpeakIcon,
  ActionTableIcon: ActionIcons.ActionTableIcon,
  ActionTimeIcon: ActionIcons.ActionTimeIcon,
  AmplitudeLogo,
  ApifyLogo,
  AsanaLogo,
  AttioLogo,
  AshbyLogo,
  BigQueryLogo,
  ToolsIcon: ShapesPlus,
  CanvaLogo,
  ClariLogo,
  CommandLineIcon: Terminal,
  ConfluenceLogo,
  ContentsquareLogo,
  CostoryLogo,
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
  HexLogo,
  HubspotLogo,
  IntercomLogo,
  JiraLogo,
  LinearLogo,
  LumaLogo,
  MicrosoftExcelLogo,
  MicrosoftLogo,
  MicrosoftOutlookLogo,
  MicrosoftTeamsLogo,
  MiroLogo,
  MondayLogo,
  NaptaLogo,
  NetSuiteLogo,
  NotionLogo,
  OpenaiLogo,
  PowerBiLogo,
  PraizLogo,
  ProductboardLogo,
  PuzzleIcon: PuzzlePiece01,
  SalesforceLogo,
  SemrushLogo,
  SalesloftLogo,
  SlabLogo,
  SlackLogo,
  SnowflakeLogo,
  StatuspageLogo,
  StripeLogo,
  SupabaseLogo,
  TerminalSquareIcon: TerminalSquare,
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
