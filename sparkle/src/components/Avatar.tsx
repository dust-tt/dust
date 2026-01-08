import { cva } from "class-variance-authority";
import React, { useState } from "react";

import { Tooltip } from "@sparkle/components";
import { UserIcon } from "@sparkle/icons/app";
import { getEmojiAndBackgroundFromUrl } from "@sparkle/lib/avatar/utils";
import { cn } from "@sparkle/lib/utils";

export const AVATAR_SIZES = [
  "xxs",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "auto",
] as const;
export type AvatarSizeType = (typeof AVATAR_SIZES)[number];

export const AVATAR_VARIANTS = ["default", "clickable", "disabled"] as const;
export type AvatarVariantType = (typeof AVATAR_VARIANTS)[number];

const avatarVariants = cva(
  "s-flex s-flex-shrink-0 s-items-center s-justify-center s-overflow-hidden",
  {
    variants: {
      size: {
        xxs: "s-h-5 s-w-5",
        xs: "s-h-6 s-w-6",
        sm: "s-h-8 s-w-8",
        md: "s-h-10 s-w-10",
        lg: "s-h-16 s-w-16",
        xl: "s-h-20 s-w-20",
        "2xl": "s-h-36 s-w-36",
        auto: "s-w-full s-relative",
      },
      variant: {
        default: "",
        clickable:
          "s-cursor-pointer hover:s-filter group-hover:s-filter group-hover:s-brightness-110 hover:s-brightness-110 group-active:s-brightness-90 active:s-brightness-90 s-transition s-duration-200 s-ease-out",
        disabled: "s-opacity-50",
      },
      rounded: {
        true: "s-rounded-full s-ring-[1px] s-ring-border-dark/50 dark:s-ring-border-dark-night/50",
        false: "",
      },
    },
    compoundVariants: [
      {
        rounded: false,
        size: "xxs",
        className: "s-rounded",
      },
      {
        rounded: false,
        size: "xs",
        className: "s-rounded-md",
      },
      {
        rounded: false,
        size: "sm",
        className: "s-rounded-lg",
      },
      {
        rounded: false,
        size: "md",
        className: "s-rounded-xl",
      },
      {
        rounded: false,
        size: "lg",
        className: "s-rounded-2xl",
      },
      {
        rounded: false,
        size: "xl",
        className: "s-rounded-[22px]",
      },
      {
        rounded: false,
        size: "2xl",
        className: "s-rounded-[32px]",
      },
      {
        rounded: false,
        size: "auto",
        className: "s-rounded-[24%]",
      },
    ],
    defaultVariants: {
      size: "md",
      variant: "default",
      rounded: false,
    },
  }
);

const textVariants = cva("s-select-none s-font-semibold", {
  variants: {
    size: {
      xxs: "s-text-[10px]",
      xs: "s-text-xs",
      sm: "s-text-sm",
      md: "s-text-base",
      lg: "s-text-3xl",
      xl: "s-text-5xl",
      "2xl": "s-text-7xl",
      auto: "s-text-xl",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const getColor = (name: string) => {
  if (/\+/.test(name)) {
    return "s-bg-primary-300";
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "s-bg-blue-300",
    "s-bg-violet-300",
    "s-bg-pink-300",
    "s-bg-red-300",
    "s-bg-orange-300",
    "s-bg-golden-300",
    "s-bg-lime-300",
    "s-bg-emerald-300",
  ];
  return colors[Math.abs(hash) % colors.length];
};

const getTextVariant = (name: string) => {
  if (/\+/.test(name)) {
    return "s-text-muted-foreground";
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const txtColors = [
    "s-text-blue-700",
    "s-text-violet-700",
    "s-text-pink-700",
    "s-text-red-700",
    "s-text-orange-700",
    "s-text-golden-700",
    "s-text-lime-700",
    "s-text-emerald-700",
  ];
  return txtColors[Math.abs(hash) % txtColors.length];
};

interface AvatarProps {
  size?: AvatarSizeType;
  name?: string;
  emoji?: string;
  visual?: string | React.ReactNode;
  onClick?: () => void;
  clickable?: boolean;
  busy?: boolean;
  isRounded?: boolean;
  backgroundColor?: string;
  hexBgColor?: string;
  className?: string;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
}

export function Avatar({
  size,
  name,
  emoji,
  visual,
  onClick,
  clickable = false,
  busy = false,
  isRounded = false,
  backgroundColor,
  hexBgColor,
  disabled = false,
  className,
  icon,
  iconColor = "s-text-foreground",
}: AvatarProps) {
  const normalizedVisual = visual === "" ? null : visual;
  const emojiInfos =
    typeof normalizedVisual === "string" &&
    getEmojiAndBackgroundFromUrl(normalizedVisual);
  const backgroundColorToUse = emojiInfos
    ? emojiInfos.backgroundColor
    : backgroundColor;
  const emojiToUse = emojiInfos ? emojiInfos.skinEmoji : emoji;
  const visualToUse = emojiInfos ? null : normalizedVisual;

  const variant: AvatarVariantType = disabled
    ? "disabled"
    : (onClick || clickable) && !busy
      ? "clickable"
      : "default";

  return (
    <div
      className={cn(
        typeof visualToUse !== "string" && "s-border s-border-primary-800/10",
        avatarVariants({
          size,
          variant,
          rounded: isRounded,
        }),
        busy ? "s-animate-breathing s-cursor-default" : "",
        hexBgColor
          ? ""
          : backgroundColorToUse
            ? backgroundColorToUse
            : name
              ? getColor(name)
              : "s-bg-muted-background",
        className
      )}
      style={hexBgColor ? { backgroundColor: hexBgColor } : undefined}
    >
      {size === "auto" && <div style={{ paddingBottom: "100%" }} />}
      {typeof visualToUse === "string" ? (
        <img
          src={visualToUse}
          alt={name}
          className={cn(
            avatarVariants({ size }),
            "s-object-cover s-object-center"
          )}
        />
      ) : visualToUse ? (
        visualToUse
      ) : icon ? (
        React.createElement(icon, {
          className: cn("s-h-1/2 s-w-1/2", iconColor),
        })
      ) : emojiToUse ? (
        <span className={textVariants({ size })}>{emojiToUse}</span>
      ) : name ? (
        <span className={cn(textVariants({ size }), getTextVariant(name))}>
          {/\+/.test(name) ? name : name[0].toUpperCase()}
        </span>
      ) : (
        <UserIcon className="s-h-1/2 s-w-1/2 s-text-foreground s-opacity-20" />
      )}
    </div>
  );
}

const AVATAR_STACK_SIZES = ["xs", "sm", "md"] as const;
type AvatarStackSizeType = (typeof AVATAR_STACK_SIZES)[number];

interface AvatarStackProps {
  avatars: AvatarProps[];
  nbVisibleItems?: number;
  size?: AvatarStackSizeType;
  hasMagnifier?: boolean;
  tooltipTriggerAsChild?: boolean;
  orientation?: "horizontal" | "vertical";
  onTop?: "first" | "last";
}

const sizeClassesPx: Record<AvatarStackSizeType, number> = {
  xs: 24,
  sm: 32,
  md: 40,
};

Avatar.Stack = function ({
  avatars,
  nbVisibleItems,
  size = "sm",
  hasMagnifier = true,
  tooltipTriggerAsChild = false,
  orientation = "horizontal",
  onTop = "last",
}: AvatarStackProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Get visible avatars and calculate remaining count
  const shouldShowAll = !nbVisibleItems || avatars.length <= nbVisibleItems;
  let visibleAvatars;
  let remainingCount;

  if (onTop === "first") {
    // When onTop="first", show all nbVisibleItems without remaining count
    visibleAvatars = shouldShowAll ? avatars : avatars.slice(0, nbVisibleItems);
    remainingCount = 0; // Always 0 when onTop="first"

    // Reverse insertion order so last avatar (first in original) is inserted first (appears on top)
    visibleAvatars = [...visibleAvatars].reverse();
  } else {
    // Default behavior: show nbVisibleItems - 1 + remaining count indicator
    visibleAvatars = shouldShowAll
      ? avatars
      : avatars.slice(0, nbVisibleItems - 1);
    remainingCount = shouldShowAll ? 0 : avatars.length - (nbVisibleItems - 1);
  }

  // Get all names for tooltip
  const avatarNames = avatars
    .filter((avatar) => avatar.name)
    .map((avatar) => avatar.name);
  const tooltipLabel = avatarNames.join(", ");

  const sizeSetting = {
    marginLeft: 0,
    widthHovered: sizeClassesPx[size] * 0.6,
    width: sizeClassesPx[size] * 0.25,
    heightHovered: sizeClassesPx[size] * 0.6,
    height: sizeClassesPx[size] * 0.25,
  };

  const collapsedWidth =
    sizeSetting.width *
      (visibleAvatars.length + Number(Boolean(remainingCount))) +
    (sizeClassesPx[size] - sizeSetting.width);

  const openedWidth =
    sizeSetting.widthHovered *
      (visibleAvatars.length + Number(Boolean(remainingCount))) +
    (sizeClassesPx[size] - sizeSetting.widthHovered);

  const collapsedHeight =
    sizeSetting.height *
      (visibleAvatars.length + Number(Boolean(remainingCount))) +
    (sizeClassesPx[size] - sizeSetting.height);

  const openedHeight =
    sizeSetting.heightHovered *
      (visibleAvatars.length + Number(Boolean(remainingCount))) +
    (sizeClassesPx[size] - sizeSetting.heightHovered);

  const transitionSettings =
    orientation === "vertical"
      ? "height 200ms ease-out"
      : "width 200ms ease-out";

  return (
    <Tooltip
      label={tooltipLabel}
      tooltipTriggerAsChild={tooltipTriggerAsChild}
      trigger={
        <>
          <div
            className={cn(
              "s-flex",
              onTop === "first"
                ? orientation === "vertical"
                  ? "s-flex-col-reverse s-justify-end"
                  : "s-flex-row-reverse s-justify-end"
                : orientation === "vertical"
                  ? "s-flex-col"
                  : "s-flex-row"
            )}
            onMouseEnter={() => visibleAvatars.length > 1 && setIsHovered(true)}
            onMouseLeave={() =>
              visibleAvatars.length > 1 && setIsHovered(false)
            }
            style={{
              [orientation === "vertical" ? "height" : "width"]: `${
                isHovered
                  ? orientation === "vertical"
                    ? openedHeight
                    : openedWidth
                  : orientation === "vertical"
                    ? collapsedHeight
                    : collapsedWidth
              }px`,
              transition: transitionSettings,
            }}
          >
            {visibleAvatars.map((avatarProps, i) => (
              <div
                key={i}
                className="s-cursor-pointer"
                style={{
                  [orientation === "vertical" ? "height" : "width"]: isHovered
                    ? orientation === "vertical"
                      ? sizeSetting.heightHovered
                      : sizeSetting.widthHovered
                    : orientation === "vertical"
                      ? sizeSetting.height
                      : sizeSetting.width,
                  transition: transitionSettings,
                }}
              >
                {hasMagnifier ? (
                  <div
                    style={{
                      transform: `scale(${
                        onTop === "first"
                          ? 1 - (visibleAvatars.length - 1 - i) * 0.06
                          : 1 - (visibleAvatars.length - i) * 0.06
                      })`,
                    }}
                  >
                    <Avatar {...avatarProps} size={size} />
                  </div>
                ) : (
                  <Avatar {...avatarProps} size={size} />
                )}
              </div>
            ))}
            {remainingCount > 0 && (
              <div
                className="s-cursor-pointer"
                style={{
                  [orientation === "vertical" ? "height" : "width"]: isHovered
                    ? orientation === "vertical"
                      ? sizeSetting.heightHovered
                      : sizeSetting.widthHovered
                    : orientation === "vertical"
                      ? sizeSetting.height
                      : sizeSetting.width,
                  transition: transitionSettings,
                }}
              >
                <Avatar
                  size={size}
                  name={
                    "+" +
                    String(Number(remainingCount) < 10 ? remainingCount : "")
                  }
                  clickable
                />
              </div>
            )}
          </div>
        </>
      }
    />
  );
};
