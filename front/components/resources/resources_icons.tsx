import type { Avatar, Icon } from "@dust-tt/sparkle";
import {
  ActionFrameV2,
  ActionIcons,
  AmplitudeLogo,
  Announcement01V2,
  ApifyLogo,
  AsanaLogo,
  AshbyLogo,
  Atom01V2,
  AttioLogo,
  BigQueryLogo,
  BrainV2,
  CanvaLogo,
  CheckCircleV2,
  ClariLogo,
  ClockV2,
  CloudArrowLeftRightV2,
  ConfluenceLogo,
  ContentsquareLogo,
  CostoryLogo,
  DriveLogo,
  FaceSmileV2,
  FathomLogo,
  File06V2,
  FreshserviceLogo,
  FrontLogo,
  GcalLogo,
  GitBranch01V2,
  GithubLogo,
  GitlabLogo,
  Globe01V2,
  GmailLogo,
  GongLogo,
  GoogleSpreadsheetLogo,
  GranolaLogo,
  GuruLogo,
  HexLogo,
  HubspotLogo,
  Image01V2,
  IntercomLogo,
  JiraLogo,
  LemlistLogo,
  Lightbulb04V2,
  LinearLogo,
  ListSelectV2,
  Lock01V2,
  LumaLogo,
  MessageCircle01V2,
  MessageDotsCircleV2,
  MessageSmileCircleV2,
  MicrosoftExcelLogo,
  MicrosoftLogo,
  MicrosoftOutlookLogo,
  MicrosoftTeamsLogo,
  MiroLogo,
  MondayLogo,
  NetSuiteLogo,
  NotionLogo,
  OpenaiLogo,
  PieChart01V2,
  PowerBiLogo,
  PraizLogo,
  PresentationChart01V2,
  ProductboardLogo,
  PuzzlePiece01V2,
  RobotV2,
  SalesforceLogo,
  SalesloftLogo,
  ScanV2,
  SearchMdV2,
  SemrushLogo,
  ShapesPlusV2,
  SlabLogo,
  SlackLogo,
  SnowflakeLogo,
  Avatar as SparkleAvatar,
  StatuspageLogo,
  StripeLogo,
  SupabaseLogo,
  TableV2,
  TerminalV2,
  UkgLogo,
  ValTownLogo,
  VantaLogo,
  VolumeMaxV2,
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
  ActionAtomIcon: Atom01V2,
  ActionBrainIcon: BrainV2,
  ActionChatBubbleBottomCenterTextIcon: MessageCircle01V2,
  ActionChatBubbleThoughtIcon: MessageDotsCircleV2,
  ActionCheckCircleIcon: CheckCircleV2,
  ActionCloudArrowLeftRightIcon: CloudArrowLeftRightV2,
  ActionDocumentTextIcon: File06V2,
  ActionEmotionLaughIcon: FaceSmileV2,
  ActionFrameIcon: ActionFrameV2,
  ActionGitBranchIcon: GitBranch01V2,
  ActionGlobeAltIcon: Globe01V2,
  ActionImageIcon: Image01V2,
  ActionLightbulbIcon: Lightbulb04V2,
  ActionListCheckIcon: ListSelectV2,
  ActionLockIcon: Lock01V2,
  ActionMagnifyingGlassIcon: SearchMdV2,
  ActionMegaphoneIcon: Announcement01V2,
  ActionNoiseIcon: VolumeMaxV2,
  ActionPieChartIcon: PieChart01V2,
  ActionRobotIcon: RobotV2,
  ActionScanIcon: ScanV2,
  ActionSlideshowIcon: PresentationChart01V2,
  ActionSpeakIcon: MessageSmileCircleV2,
  ActionTableIcon: TableV2,
  ActionTimeIcon: ClockV2,
  AmplitudeLogo,
  ApifyLogo,
  AsanaLogo,
  AttioLogo,
  AshbyLogo,
  BigQueryLogo,
  ToolsIcon: ShapesPlusV2,
  CanvaLogo,
  ClariLogo,
  CommandLineIcon: TerminalV2,
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
  LemlistLogo,
  LinearLogo,
  LumaLogo,
  MicrosoftExcelLogo,
  MicrosoftLogo,
  MicrosoftOutlookLogo,
  MicrosoftTeamsLogo,
  MiroLogo,
  MondayLogo,
  NetSuiteLogo,
  NotionLogo,
  OpenaiLogo,
  PowerBiLogo,
  PraizLogo,
  ProductboardLogo,
  PuzzleIcon: PuzzlePiece01V2,
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
