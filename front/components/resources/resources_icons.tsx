import type { Avatar, Icon } from "@dust-tt/sparkle";
import {
  ActionIcons,
  AdomikLogo,
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
  cn,
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
  LemlistLogo,
  LinearLogo,
  LumaLogo,
  MicrosoftExcelLogo,
  MicrosoftLogo,
  MicrosoftOutlookLogo,
  MicrosoftTeamsLogo,
  MiroLogo,
  ModjoLogo,
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
  ShopifyLogo,
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
  YoutrustLogo,
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

type ResourceAvatarSize = NonNullable<ComponentProps<typeof Avatar>["size"]>;

const AVATAR_BADGE_CLASSES: Record<
  ResourceAvatarSize,
  { badge: string; icon: string }
> = {
  "3xs": { badge: "h-2.5 w-2.5 rounded-xs", icon: "h-1.5 w-1.5" },
  xxs: { badge: "h-3 w-3 rounded-xs", icon: "h-2 w-2" },
  xs: { badge: "h-3.5 w-3.5 rounded-sm", icon: "h-2.5 w-2.5" },
  sm: { badge: "h-4 w-4 rounded-sm", icon: "h-3 w-3" },
  md: { badge: "h-5 w-5 rounded-sm", icon: "h-3.5 w-3.5" },
  lg: { badge: "h-6 w-6 rounded-md", icon: "h-4 w-4" },
  xl: { badge: "h-7 w-7 rounded-md", icon: "h-5 w-5" },
  "2xl": { badge: "h-9 w-9 rounded-lg", icon: "h-7 w-7" },
  auto: { badge: "h-7 w-7 rounded-md", icon: "h-5 w-5" },
};

interface ResourceAvatarWithBadgeProps extends ResourceAvatarProps {
  badgeIcon: ComponentType<{ className?: string }>;
  badgeSize: ResourceAvatarSize;
}

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

export function ResourceAvatarWithBadge({
  badgeIcon: BadgeIcon,
  badgeSize,
  className,
  ...props
}: ResourceAvatarWithBadgeProps) {
  const badgeClasses = AVATAR_BADGE_CLASSES[badgeSize];

  return (
    <div className={cn("relative inline-flex overflow-visible", className)}>
      <ResourceAvatar className={className} {...props} />
      <span
        className={cn(
          "pointer-events-none absolute bottom-0 right-0",
          "flex items-center justify-center bg-background shadow-sm ring-1 ring-border",
          "",
          badgeClasses.badge
        )}
      >
        <BadgeIcon className={badgeClasses.icon} />
      </span>
    </div>
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
  ActionStoreIcon: ActionIcons.ActionStoreIcon,
  ActionTableIcon: ActionIcons.ActionTableIcon,
  ActionTimeIcon: ActionIcons.ActionTimeIcon,
  AdomikLogo,
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
  LemlistLogo,
  LinearLogo,
  LumaLogo,
  MicrosoftExcelLogo,
  MicrosoftLogo,
  MicrosoftOutlookLogo,
  MicrosoftTeamsLogo,
  MiroLogo,
  ModjoLogo,
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
  ShopifyLogo,
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
  YoutrustLogo,
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
