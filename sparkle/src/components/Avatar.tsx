import { cva } from "class-variance-authority";
import React, { useState } from "react";

import { UserIcon } from "@sparkle/icons/solid";
import { getEmojiAndBackgroundFromUrl } from "@sparkle/lib/avatar/utils";
import { cn } from "@sparkle/lib/utils";

const AVATAR_SIZES = ["xs", "sm", "md", "lg", "xl", "xxl", "auto"] as const;
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
        xxl: "s-h-36 s-w-36",
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
        size: "xxl",
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

const textVariants = cva("s-select-none s-font-medium", {
  variants: {
    size: {
      xs: "s-text-xs",
      sm: "s-text-sm",
      md: "s-text-base",
      lg: "s-text-3xl",
      xl: "s-text-5xl",
      xxl: "s-text-7xl",
      auto: "s-text-xl",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const getColor = (name: string) => {
  if (/\+/.test(name)) {
    return "s-bg-slate-300";
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "s-bg-red-300 dark:s-bg-red-300-night",
    "s-bg-orange-300 dark:s-bg-orange-300-night",
    "s-bg-amber-300 dark:s-bg-amber-300-night",
    "s-bg-yellow-300 dark:s-bg-yellow-300-night",
    "s-bg-lime-300 dark:s-bg-lime-300-night",
    "s-bg-green-300 dark:s-bg-green-300-night",
    "s-bg-emerald-300 dark:s-bg-emerald-300-night",
    "s-bg-teal-300 dark:s-bg-teal-300-night",
    "s-bg-cyan-300 dark:s-bg-cyan-300-night",
    "s-bg-sky-300 dark:s-bg-sky-300-night",
    "s-bg-blue-300 dark:s-bg-blue-300-night",
    "s-bg-indigo-300 dark:s-bg-indigo-300-night",
    "s-bg-violet-300 dark:s-bg-violet-300-night",
    "s-bg-purple-300 dark:s-bg-purple-300-night",
    "s-bg-fuchsia-300 dark:s-bg-fuchsia-300-night",
    "s-bg-rose-300 dark:s-bg-rose-300-night",
  ];
  return colors[Math.abs(hash) % colors.length];
};

const getTextVariant = (name: string) => {
  if (/\+/.test(name)) {
    return "s-text-slate-700 dark:s-text-slate-700-night";
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const txtColors = [
    "s-text-red-700 dark:s-text-red-700-night ",
    "s-text-orange-700 dark:s-text-orange-700-night",
    "s-text-amber-700 dark:s-text-amber-700-night",
    "s-text-yellow-700 dark:s-text-yellow-700-night",
    "s-text-lime-700 dark:s-text-lime-700-night",
    "s-text-green-700 dark:s-text-green-700-night",
    "s-text-emerald-700 dark:s-text-emerald-700-night",
    "s-text-teal-700 dark:s-text-teal-700-night",
    "s-text-cyan-700 dark:s-text-cyan-700-night",
    "s-text-sky-700 dark:s-text-sky-700-night",
    "s-text-blue-700 dark:s-text-blue-700-night",
    "s-text-indigo-700 dark:s-text-indigo-700-night",
    "s-text-violet-700 dark:s-text-violet-700-night",
    "s-text-purple-700 dark:s-text-purple-700-night",
    "s-text-fuchsia-700 dark:s-text-fuchsia-700-night",
    "s-text-rose-700 dark:s-text-rose-700-night",
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
  className?: string;
  disabled?: boolean;
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
  disabled = false,
  className,
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
        avatarVariants({
          size,
          variant,
          rounded: isRounded,
        }),
        busy ? "s-animate-breathing s-cursor-default" : "",
        backgroundColorToUse
          ? backgroundColorToUse
          : name
            ? getColor(name)
            : "s-bg-slate-200",
        className
      )}
    >
      {size === "auto" && <div style={{ paddingBottom: "100%" }} />}
      {typeof visualToUse === "string" ? (
        <img
          src={visualToUse}
          alt={name}
          className={cn(
            avatarVariants({ size }),
            "s-h-full s-w-full s-object-cover s-object-center"
          )}
        />
      ) : visualToUse ? (
        visualToUse
      ) : emojiToUse ? (
        <span className={textVariants({ size })}>{emojiToUse}</span>
      ) : name ? (
        <span className={cn(textVariants({ size }), getTextVariant(name))}>
          {/\+/.test(name) ? name : name[0].toUpperCase()}
        </span>
      ) : (
        <UserIcon className="s-h-1/2 s-w-1/2 s-opacity-20" />
      )}
    </div>
  );
}

const AVATAR_STACK_SIZES = ["xs", "sm", "md"] as const;
type AvatarStackSizeType = (typeof AVATAR_STACK_SIZES)[number];

interface AvatarStackProps {
  children: React.ReactElement<AvatarProps> | React.ReactElement<AvatarProps>[];
  nbMoreItems?: number;
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
  children,
  nbMoreItems,
  size = "sm",
  isRounded = false,
  hasMagnifier = true,
}: AvatarStackProps) {
  const [isHovered, setIsHovered] = useState(false);
  const childrenArray = React.Children.toArray(children);

  const sizeSetting = {
    marginLeft: 0,
    widthHovered: sizeClassesPx[size] * 0.6,
    width: sizeClassesPx[size] * 0.25,
  };

  const collapsedWidth =
    sizeSetting.width * (childrenArray.length + Number(Boolean(nbMoreItems))) +
    (sizeClassesPx[size] - sizeSetting.width);

  const openedWidth =
    sizeSetting.widthHovered *
      (childrenArray.length + Number(Boolean(nbMoreItems))) +
    (sizeClassesPx[size] - sizeSetting.widthHovered);

  const transitionSettings = "width 200ms ease-out";

  return (
    <div
      className="s-flex s-flex-row"
      onMouseEnter={() => childrenArray.length > 1 && setIsHovered(true)}
      onMouseLeave={() => childrenArray.length > 1 && setIsHovered(false)}
      style={{
        width: `${isHovered ? openedWidth : collapsedWidth}px`,
        transition: transitionSettings,
      }}
    >
      {childrenArray.map((child, i) => {
        if (React.isValidElement<AvatarProps>(child)) {
          return (
            <div
              key={i}
              className="s-cursor-pointer s-drop-shadow-md"
              style={{
                width: isHovered ? sizeSetting.widthHovered : sizeSetting.width,
                transition: transitionSettings,
              }}
            >
              {hasMagnifier ? (
                <div
                  style={{
                    transform: `scale(${
                      1 - (childrenArray.length - i) * 0.06
                    })`,
                  }}
                >
                  {React.cloneElement(child, {
                    size: size,
                    isRounded: isRounded,
                  })}
                </div>
              ) : (
                React.cloneElement(child, {
                  size: size,
                  isRounded: isRounded,
                })
              )}
            </div>
          );
        }
        return null;
      })}
      {Boolean(nbMoreItems) && (
        <div
          className="s-cursor-pointer s-drop-shadow-md"
          style={{
            width: isHovered ? sizeSetting.widthHovered : sizeSetting.width,
            transition: transitionSettings,
          }}
        >
          <Avatar
            size={size}
            name={"+" + String(Number(nbMoreItems) < 10 ? nbMoreItems : "")}
            isRounded={isRounded}
            clickable
          />
        </div>
      )}
    </div>
  );
};
