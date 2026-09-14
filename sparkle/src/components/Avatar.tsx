import { ImageWrapper } from "@sparkle/components/ImageWrapper";
import { Tooltip } from "@sparkle/components/Tooltip";
import { User01 } from "@sparkle/icons/v2-stroke";
import { getEmojiAndBackgroundFromUrl } from "@sparkle/lib/avatar/utils";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { useState } from "react";

export const AVATAR_SIZES = [
  "3xs",
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
  "flex flex-shrink-0 items-center justify-center overflow-hidden",
  {
    variants: {
      size: {
        "3xs": "h-4 w-4",
        xxs: "h-5 w-5",
        xs: "h-7 w-7",
        sm: "h-9 w-9",
        md: "h-12 w-12",
        lg: "h-16 w-16",
        xl: "h-20 w-20",
        "2xl": "h-36 w-36",
        auto: "w-full relative",
      },
      variant: {
        default: "",
        clickable:
          "cursor-pointer hover:filter group-hover:filter group-hover:brightness-110 hover:brightness-110 group-active:brightness-90 active:brightness-90 transition duration-200 ease-out",
        disabled: "opacity-50",
      },
      rounded: {
        true: "rounded-full ring-[1px] ring-border-dark/50",
        false: "",
      },
    },
    compoundVariants: [
      {
        rounded: false,
        size: "3xs",
        className: "rounded",
      },
      {
        rounded: false,
        size: "xxs",
        className: "rounded-sm",
      },
      {
        rounded: false,
        size: "xs",
        className: "rounded-md",
      },
      {
        rounded: false,
        size: "sm",
        className: "rounded-lg",
      },
      {
        rounded: false,
        size: "md",
        className: "rounded-xl",
      },
      {
        rounded: false,
        size: "lg",
        className: "rounded-2xl",
      },
      {
        rounded: false,
        size: "xl",
        className: "rounded-3xl",
      },
      {
        rounded: false,
        size: "2xl",
        className: "rounded-4xl",
      },
      {
        rounded: false,
        size: "auto",
        // Keep the corner proportional when the avatar has no fixed dimensions.
        className: "rounded-[24%]",
      },
    ],
    defaultVariants: {
      size: "md",
      variant: "default",
      rounded: false,
    },
  }
);

const textVariants = cva("select-none font-semibold", {
  variants: {
    size: {
      "3xs": "text-[8px]",
      xxs: "text-[10px]",
      xs: "text-xs",
      sm: "text-sm",
      md: "text-base",
      lg: "text-3xl",
      xl: "text-5xl",
      "2xl": "text-7xl",
      auto: "text-xl",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const getColor = (name: string) => {
  if (/\+/.test(name)) {
    return "bg-primary-300";
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "bg-blue-300",
    "bg-violet-300",
    "bg-pink-300",
    "bg-red-300",
    "bg-orange-300",
    "bg-golden-300",
    "bg-lime-300",
    "bg-emerald-300",
  ];
  return colors[Math.abs(hash) % colors.length];
};

const getTextVariant = (name: string) => {
  if (/\+/.test(name)) {
    return "text-muted-foreground";
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const txtColors = [
    "text-blue-700",
    "text-violet-700",
    "text-pink-700",
    "text-red-700",
    "text-orange-700",
    "text-golden-700",
    "text-lime-700",
    "text-emerald-700",
  ];
  return txtColors[Math.abs(hash) % txtColors.length];
};

export interface AvatarProps {
  size?: AvatarSizeType;
  /** Entity name; used for the initials fallback, its color, and the image alt text. */
  name?: string;
  /** Emoji to display instead of an image or initials. */
  emoji?: string;
  /** Image URL (including emoji URLs) or an arbitrary React node to render. */
  visual?: string | React.ReactNode;
  /** Invoked on click; its presence also applies the clickable hover style. */
  onClick?: () => void;
  /** Apply the clickable hover style without providing an `onClick`. */
  clickable?: boolean;
  /** Show a breathing animation, e.g. while the entity is working. */
  busy?: boolean;
  /** Render as a circle instead of the size-proportional rounded square. */
  isRounded?: boolean;
  /** Background Tailwind class used behind initials, emoji, or icons. */
  backgroundColor?: string;
  /** Background as a raw hex color, taking precedence over `backgroundColor`. */
  hexBgColor?: string;
  className?: string;
  disabled?: boolean;
  /** Icon component to display instead of an image, emoji, or initials. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Tailwind text-color class for the `icon` (default `text-foreground`). */
  iconColor?: string;
}

/**
 * Represents a user, agent, or entity with an image, emoji, icon, or initials
 * fallback, in a range of sizes with busy and clickable states. Use it to identify
 * the author of a message, a workspace member, or an agent; always provide a `name`
 * for a sensible fallback. For a group of entities, use Avatar.Stack (AvatarSet)
 * rather than several loose avatars.
 * @summary Entity avatar with fallbacks.
 */
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
  iconColor = "text-foreground",
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

  const isImageVisual = typeof visualToUse === "string";
  const bgColorClass =
    isImageVisual || hexBgColor
      ? ""
      : (backgroundColorToUse ??
        (name ? getColor(name) : "bg-muted-background"));

  return (
    <div
      className={cn(
        !isImageVisual && "border border-primary-800/10",
        avatarVariants({
          size,
          variant,
          rounded: isRounded,
        }),
        busy ? "animate-breathing cursor-default" : "",
        bgColorClass,
        className
      )}
      style={
        hexBgColor && !isImageVisual
          ? { backgroundColor: hexBgColor }
          : undefined
      }
    >
      {size === "auto" && <div style={{ paddingBottom: "100%" }} />}
      {typeof visualToUse === "string" ? (
        <ImageWrapper
          src={visualToUse}
          alt={name}
          className={cn(avatarVariants({ size }), "object-cover object-center")}
        />
      ) : visualToUse ? (
        visualToUse
      ) : icon ? (
        React.createElement(icon, {
          className: cn("h-1/2 w-1/2", iconColor),
        })
      ) : emojiToUse ? (
        <span className={textVariants({ size })}>{emojiToUse}</span>
      ) : name ? (
        <span className={cn(textVariants({ size }), getTextVariant(name))}>
          {/\+/.test(name) ? name : name[0].toUpperCase()}
        </span>
      ) : (
        <User01 className="h-1/2 w-1/2 text-foreground opacity-20" />
      )}
    </div>
  );
}

const AVATAR_STACK_SIZES = ["xs", "sm", "md"] as const;
type AvatarStackSizeType = (typeof AVATAR_STACK_SIZES)[number];

export interface AvatarStackProps {
  avatars: AvatarProps[];
  /** Max avatars shown before collapsing the rest into a "+N" counter. */
  nbVisibleItems?: number;
  size?: AvatarStackSizeType;
  /** Slightly scale down avatars deeper in the stack for a depth effect (default true). */
  hasMagnifier?: boolean;
  /** Forwarded to the Tooltip's `tooltipTriggerAsChild`. */
  tooltipTriggerAsChild?: boolean;
  orientation?: "horizontal" | "vertical";
  /** Which end of the list renders on top of the overlap: `first` or `last`. */
  onTop?: "first" | "last";
}

const sizeClassesPx: Record<AvatarStackSizeType, number> = {
  xs: 24,
  sm: 32,
  md: 40,
};

/**
 * An overlapping stack of Avatars that expands on hover, collapsing extras into a
 * "+N" counter and listing all names in a tooltip.
 * @summary Overlapping avatar stack.
 */
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
  const isFirstOnTop = onTop === "first";

  const maxVisible = shouldShowAll
    ? avatars.length
    : isFirstOnTop
      ? nbVisibleItems
      : nbVisibleItems - 1;

  const visibleAvatars = isFirstOnTop
    ? avatars.slice(0, maxVisible).reverse()
    : avatars.slice(0, maxVisible);

  const remainingCount =
    shouldShowAll || isFirstOnTop ? 0 : avatars.length - maxVisible;

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
              "flex",
              onTop === "first"
                ? orientation === "vertical"
                  ? "flex-col-reverse justify-end"
                  : "flex-row-reverse justify-end"
                : orientation === "vertical"
                  ? "flex-col"
                  : "flex-row"
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
                className="cursor-pointer"
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
                          ? 1 -
                            (visibleAvatars.length +
                              (remainingCount > 0 ? 1 : 0) -
                              1 -
                              i) *
                              0.06
                          : 1 -
                            (visibleAvatars.length +
                              (remainingCount > 0 ? 1 : 0) -
                              i) *
                              0.06
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
                className="cursor-pointer"
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
                      transform: `scale(${onTop === "first" ? 1 : 1 - 0.06})`,
                    }}
                  >
                    <Avatar
                      size={size}
                      name={
                        Number(remainingCount) < 10
                          ? `+${remainingCount}`
                          : "9+"
                      }
                    />
                  </div>
                ) : (
                  <Avatar
                    size={size}
                    name={
                      Number(remainingCount) < 10 ? `+${remainingCount}` : "9+"
                    }
                  />
                )}
              </div>
            )}
          </div>
        </>
      }
    />
  );
};
