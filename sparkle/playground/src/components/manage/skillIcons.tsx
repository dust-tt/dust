import {
  Avatar,
  BarChart04,
  Calendar,
  CreditCard01,
  DustLogoSquare,
  File06,
  Flag01,
  Globe01,
  LayoutGrid01,
  Lightbulb04,
  MagicWand02,
  Mail01,
  MessageCircle01,
  Monitor01,
  PresentationChart01,
  PuzzlePiece01,
  Rocket01,
  Scales01,
  SearchLg,
  Table,
} from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import type { SkillIconKey } from "../../data/manageSkills";

export const SKILL_ICON = PuzzlePiece01;
export const SKILL_AVATAR_BACKGROUND_COLOR = "bg-highlight-50";
export const SKILL_AVATAR_ICON_COLOR = "text-highlight";

const SKILL_ICONS: Record<
  SkillIconKey,
  ComponentType<{ className?: string }>
> = {
  table: Table,
  document: File06,
  search: SearchLg,
  lightbulb: Lightbulb04,
  chat: MessageCircle01,
  presentation: PresentationChart01,
  card: CreditCard01,
  chart: BarChart04,
  mail: Mail01,
  calendar: Calendar,
  globe: Globe01,
  rocket: Rocket01,
  scales: Scales01,
  clipboard: File06,
  grid: LayoutGrid01,
  wand: MagicWand02,
  monitor: Monitor01,
  flag: Flag01,
};

export function getSkillIcon(
  icon: string | null
): ComponentType<{ className?: string }> {
  if (icon && icon in SKILL_ICONS) {
    return SKILL_ICONS[icon as SkillIconKey];
  }
  return SKILL_ICON;
}

interface SkillAvatarProps {
  icon: string | null;
  // Dust-provided skills carry a Dust badge on the bottom-right of the avatar.
  isDustProvided?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const BADGE_CLASSES: Record<
  NonNullable<SkillAvatarProps["size"]>,
  { badge: string; icon: string }
> = {
  xs: { badge: "h-3 w-3 rounded-[4px]", icon: "h-2 w-2" },
  sm: { badge: "h-4 w-4 rounded-md", icon: "h-3 w-3" },
  md: { badge: "h-5 w-5 rounded-md", icon: "h-4 w-4" },
};

export function SkillAvatar({
  icon,
  isDustProvided = false,
  size = "sm",
  className,
}: SkillAvatarProps) {
  const avatar = (
    <Avatar
      icon={getSkillIcon(icon)}
      size={size}
      backgroundColor={SKILL_AVATAR_BACKGROUND_COLOR}
      iconColor={SKILL_AVATAR_ICON_COLOR}
      className={className}
    />
  );

  if (!isDustProvided) {
    return avatar;
  }

  const badgeClasses = BADGE_CLASSES[size];

  return (
    <div className={cn("relative inline-flex overflow-visible", className)}>
      {avatar}
      <span
        className={cn(
          "pointer-events-none absolute bottom-0 right-0",
          "flex items-center justify-center bg-background shadow-sm ring-1 ring-border",
          badgeClasses.badge
        )}
      >
        <DustLogoSquare className={badgeClasses.icon} />
      </span>
    </div>
  );
}
