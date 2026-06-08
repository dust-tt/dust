import type { Avatar, Icon } from "@dust-tt/sparkle";
import {
  ActionFrame,
  ActionIcons,
  AmplitudeLogo,
  Announcement01,
  ApifyLogo,
  AsanaLogo,
  AshbyLogo,
  Atom01,
  AttioLogo,
  BigQueryLogo,
  Brain,
  CanvaLogo,
  CheckCircle,
  ClariLogo,
  Clock,
  CloudArrowLeftRight,
  ConfluenceLogo,
  ContentsquareLogo,
  CostoryLogo,
  DriveLogo,
  FaceSmile,
  FathomLogo,
  File06,
  FreshserviceLogo,
  FrontLogo,
  GammaLogo,
  GcalLogo,
  GitBranch01,
  GithubLogo,
  GitlabLogo,
  Globe01,
  GmailLogo,
  GongLogo,
  GoogleSpreadsheetLogo,
  GranolaLogo,
  GuruLogo,
  HexLogo,
  HubspotLogo,
  Image01,
  IntercomLogo,
  JiraLogo,
  Lightbulb04,
  LinearLogo,
  ListSelect,
  Lock01,
  LumaLogo,
  MessageCircle01,
  MessageDotsCircle,
  MessageSmileCircle,
  MicrosoftExcelLogo,
  MicrosoftLogo,
  MicrosoftOutlookLogo,
  MicrosoftTeamsLogo,
  MiroLogo,
  MondayLogo,
  NetSuiteLogo,
  NotionLogo,
  OpenaiLogo,
  PieChart01,
  PowerBiLogo,
  PraizLogo,
  PresentationChart01,
  ProductboardLogo,
  PuzzlePiece01,
  Robot,
  SalesforceLogo,
  SalesloftLogo,
  Scan,
  SearchMd,
  SemrushLogo,
  ShapesPlus,
  SlabLogo,
  SlackLogo,
  SnowflakeLogo,
  Avatar as SparkleAvatar,
  StatuspageLogo,
  StripeLogo,
  SupabaseLogo,
  Table,
  Terminal,
  UkgLogo,
  ValTownLogo,
  VantaLogo,
  VolumeMax,
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
  ActionAtomIcon: Atom01,
  ActionBrainIcon: Brain,
  ActionChatBubbleBottomCenterTextIcon: MessageCircle01,
  ActionChatBubbleThoughtIcon: MessageDotsCircle,
  ActionCheckCircleIcon: CheckCircle,
  ActionCloudArrowLeftRightIcon: CloudArrowLeftRight,
  ActionDocumentTextIcon: File06,
  ActionEmotionLaughIcon: FaceSmile,
  ActionFrameIcon: ActionFrame,
  ActionGitBranchIcon: GitBranch01,
  ActionGlobeAltIcon: Globe01,
  ActionImageIcon: Image01,
  ActionLightbulbIcon: Lightbulb04,
  ActionListCheckIcon: ListSelect,
  ActionLockIcon: Lock01,
  ActionMagnifyingGlassIcon: SearchMd,
  ActionMegaphoneIcon: Announcement01,
  ActionNoiseIcon: VolumeMax,
  ActionPieChartIcon: PieChart01,
  ActionRobotIcon: Robot,
  ActionScanIcon: Scan,
  ActionSlideshowIcon: PresentationChart01,
  ActionSpeakIcon: MessageSmileCircle,
  ActionTableIcon: Table,
  ActionTimeIcon: Clock,
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
  GammaLogo,
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
