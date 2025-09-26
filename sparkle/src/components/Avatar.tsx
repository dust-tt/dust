import { cva } from "class-variance-authority";
import React, { useState } from "react";

import { Tooltip } from "@sparkle/components";
import { UserIcon } from "@sparkle/icons/app";
import { getEmojiAndBackgroundFromUrl } from "@sparkle/lib/avatar/utils";
import { cn } from "@sparkle/lib/utils";

const AVATAR_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl", "auto"] as const;
type AvatarSizeType = (typeof AVATAR_SIZES)[number];

const AVATAR_VARIANTS = ["default", "clickable", "disabled"] as const;
type AvatarVariantType = (typeof AVATAR_VARIANTS)[number];

const avatarVariants = cva(
  "s-flex s-flex-shrink-0 s-items-center s-justify-center s-overflow-hidden",
  {
    variants: {
      size: {
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
        true: "s-rounded-full",
        false: "",
      },
    },
    compoundVariants: [
      {
        rounded: false,
        size: "xs",
        className: "s-rounded-lg",
      },
      {
        rounded: false,
        size: "sm",
        className: "s-rounded-xl",
      },
      {
        rounded: false,
        size: "md",
        className: "s-rounded-2xl",
      },
      {
        rounded: false,
        size: "lg",
        className: "s-rounded-3xl",
      },
      {
        rounded: false,
        size: "xl",
        className: "s-rounded-[28px]",
      },
      {
        rounded: false,
        size: "2xl",
        className: "s-rounded-[38px]",
      },
      {
        rounded: false,
        size: "auto",
        className: "s-rounded-[30%]",
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
  const emojiInfos =
    typeof visual === "string" && getEmojiAndBackgroundFromUrl(visual);
  const backgroundColorToUse = emojiInfos
    ? emojiInfos.backgroundColor
    : backgroundColor;
  const emojiToUse = emojiInfos ? emojiInfos.skinEmoji : emoji;
  const visualToUse = emojiInfos ? null : visual;

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
  isRounded?: boolean;
  hasMagnifier?: boolean;
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
  isRounded = false,
  hasMagnifier = true,
}: AvatarStackProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Get visible avatars and calculate remaining count
  const shouldShowAll = !nbVisibleItems || avatars.length <= nbVisibleItems;
  const visibleAvatars = shouldShowAll
    ? avatars
    : avatars.slice(0, nbVisibleItems - 1);
  const remainingCount = shouldShowAll
    ? 0
    : avatars.length - (nbVisibleItems - 1);

  // Get all names for tooltip
  const avatarNames = avatars
    .filter((avatar) => avatar.name)
    .map((avatar) => avatar.name);
  const tooltipLabel = avatarNames.join(", ");

  const sizeSetting = {
    marginLeft: 0,
    widthHovered: sizeClassesPx[size] * 0.6,
    width: sizeClassesPx[size] * 0.25,
  };

  const collapsedWidth =
    sizeSetting.width *
      (visibleAvatars.length + Number(Boolean(remainingCount))) +
    (sizeClassesPx[size] - sizeSetting.width);

  const openedWidth =
    sizeSetting.widthHovered *
      (visibleAvatars.length + Number(Boolean(remainingCount))) +
    (sizeClassesPx[size] - sizeSetting.widthHovered);

  const transitionSettings = "width 200ms ease-out";

  return (
    <Tooltip
      label={tooltipLabel}
      tooltipTriggerAsChild
      trigger={
        <>
          <div
            className="s-flex s-flex-row"
            onMouseEnter={() => visibleAvatars.length > 1 && setIsHovered(true)}
            onMouseLeave={() =>
              visibleAvatars.length > 1 && setIsHovered(false)
            }
            style={{
              width: `${isHovered ? openedWidth : collapsedWidth}px`,
              transition: transitionSettings,
            }}
          >
            {visibleAvatars.map((avatarProps, i) => (
              <div
                key={i}
                className="s-cursor-pointer s-drop-shadow-md"
                style={{
                  width: isHovered
                    ? sizeSetting.widthHovered
                    : sizeSetting.width,
                  transition: transitionSettings,
                }}
              >
                {hasMagnifier ? (
                  <div
                    style={{
                      transform: `scale(${
                        1 - (visibleAvatars.length - i) * 0.06
                      })`,
                    }}
                  >
                    <Avatar
                      {...avatarProps}
                      size={size}
                      isRounded={isRounded}
                    />
                  </div>
                ) : (
                  <Avatar {...avatarProps} size={size} isRounded={isRounded} />
                )}
              </div>
            ))}
            {remainingCount > 0 && (
              <div
                className="s-cursor-pointer s-drop-shadow-md"
                style={{
                  width: isHovered
                    ? sizeSetting.widthHovered
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
                  isRounded={isRounded}
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
