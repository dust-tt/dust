import React, { useState } from "react";

import { UserIcon } from "@sparkle/icons/solid";
import { getEmojiAndBackgroundFromUrl } from "@sparkle/lib/avatar/utils";
import { classNames } from "@sparkle/lib/utils";

type AvatarProps = {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl" | "auto";
  name?: string;
  emoji?: string;
  visual?: string | React.ReactNode;
  clickable?: boolean;
  onClick?: () => void;
  busy?: boolean;
  isRounded?: boolean;
  backgroundColor?: string;
  className?: string;
  disabled?: boolean;
};

const colors = [
  "s-bg-red-300",
  "s-bg-orange-300",
  "s-bg-amber-300",
  "s-bg-yellow-300",
  "s-bg-lime-300",
  "s-bg-green-300",
  "s-bg-emerald-300",
  "s-bg-teal-300",
  "s-bg-cyan-300",
  "s-bg-sky-300",
  "s-bg-blue-300",
  "s-bg-indigo-300",
  "s-bg-violet-300",
  "s-bg-purple-300",
  "s-bg-fuchsia-300",
  "s-bg-rose-300",
];

const txtColors = [
  "s-text-red-700",
  "s-text-orange-700",
  "s-text-amber-700",
  "s-text-yellow-700",
  "s-text-lime-700",
  "s-text-green-700",
  "s-text-emerald-700",
  "s-text-teal-700",
  "s-text-cyan-700",
  "s-text-sky-700",
  "s-text-blue-700",
  "s-text-indigo-700",
  "s-text-violet-700",
  "s-text-purple-700",
  "s-text-fuchsia-700",
  "s-text-rose-700",
];

const sizeClasses = {
  xs: "s-h-6 s-w-6",
  sm: "s-h-8 s-w-8",
  md: "s-h-10 s-w-10",
  lg: "s-h-16 s-w-16",
  xl: "s-h-20 s-w-20",
  xxl: "s-h-36 s-w-36",
  auto: "s-w-full s-relative",
};

const roundedClasses = {
  xs: "s-rounded-lg",
  sm: "s-rounded-xl",
  md: "s-rounded-2xl",
  lg: "s-rounded-3xl",
  xl: "s-rounded-[28px]",
  xxl: "s-rounded-[38px]",
  auto: "s-rounded-[30%]",
};

const textSize = {
  xs: "s-text-xs",
  sm: "s-text-sm",
  md: "s-text-base",
  lg: "s-text-3xl",
  xl: "s-text-5xl",
  xxl: "s-text-7xl",
  auto: "s-text-xl",
};

export function Avatar({
  size = "md",
  name,
  emoji,
  visual,
  onClick,
  clickable = false,
  busy = false,
  isRounded = false,
  backgroundColor,
  disabled = false,
  className = "",
}: AvatarProps) {
  // Check if visual is a string and attempt to extract emoji and background color information from the url.
  const emojiInfos =
    typeof visual === "string" && getEmojiAndBackgroundFromUrl(visual);

  const backgroundColorToUse = emojiInfos
    ? emojiInfos.backgroundColor
    : backgroundColor;
  const emojiToUse = emojiInfos ? emojiInfos.skinEmoji : emoji;
  const visualToUse = emojiInfos ? null : visual;

  const getColor = (name: string) => {
    if (/\+/.test(name)) {
      //find if there is a plus
      return "s-bg-slate-300";
    }
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getTextVariant = (name: string) => {
    if (/\+/.test(name)) {
      return "s-text-slate-700";
    }
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return txtColors[Math.abs(hash) % txtColors.length];
  };

  const clickableStyles =
    (onClick || clickable) && !busy
      ? "s-cursor-pointer hover:s-filter group-hover:s-filter  group-hover:s-brightness-110 hover:s-brightness-110 group-active:s-brightness-90 active:s-brightness-90 s-transition s-duration-200 s-ease-out"
      : "";

  const busyStyles = busy ? "s-animate-breathing s-cursor-default" : "";

  const avatarClass = classNames(
    sizeClasses[size],
    isRounded ? "s-rounded-full" : roundedClasses[size],
    backgroundColorToUse
      ? backgroundColorToUse
      : name
        ? getColor(name)
        : "s-bg-slate-200",
    visualToUse ? "" : "s-border s-border-slate-950/10",
    "s-flex s-flex-shrink-0 s-items-center s-justify-center s-overflow-hidden",
    clickableStyles,
    busyStyles
  );

  return (
    <div
      className={classNames(
        avatarClass,
        disabled ? "s-opacity-50" : "",
        className
      )}
    >
      {size === "auto" && <div style={{ paddingBottom: "100%" }} />}
      {typeof visualToUse === "string" ? (
        <img
          src={visualToUse}
          alt={name}
          className={classNames(
            sizeClasses[size],
            "s-h-full s-w-full s-object-cover s-object-center"
          )}
        />
      ) : visualToUse ? (
        visualToUse
      ) : emojiToUse ? (
        <span
          className={classNames(textSize[size], "s-select-none s-font-medium")}
        >
          {emojiToUse}
        </span>
      ) : name ? (
        <span
          className={classNames(
            getTextVariant(name),
            textSize[size],
            "s-select-none s-font-medium"
          )}
        >
          {/\+/.test(name) ? name : name[0].toUpperCase()}
        </span>
      ) : (
        <UserIcon className="s-h-1/2 s-w-1/2 s-opacity-20" />
      )}
    </div>
  );
}

interface AvatarStackProps {
  children: React.ReactElement<AvatarProps> | React.ReactElement<AvatarProps>[];
  nbMoreItems?: number;
  size?: "xs" | "sm" | "md";
  isRounded?: boolean;
  hasMagnifier?: boolean;
}

const sizeClassesPx = {
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

  const handleMouseEnter = () => {
    if (childrenArray.length > 1) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (childrenArray.length > 1) {
      setIsHovered(false);
    }
  };

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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
                <>
                  {React.cloneElement(child, {
                    size: size,
                    isRounded: isRounded,
                  })}
                </>
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
