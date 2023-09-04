import React from "react";

import { User } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

interface AvatarProps {
  size: "xs" | "sm" | "md" | "lg" | "full";
  name?: string;
  visual?: string | React.ReactNode;
}

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
  xs: "s-h-6 s-w-6 s-rounded-full",
  sm: "s-h-10 s-w-10 s-rounded-xl",
  md: "s-h-16 s-w-16 s-rounded-2xl",
  lg: "s-h-36 s-w-36 s-rounded-3xl",
  full: "s-h-full s-w-full",
};

const textSize = {
  xs: "s-text-xs",
  sm: "s-text-base",
  md: "s-text-3xl",
  lg: "s-text-7xl",
  full: "s-text-6xl",
};

export const Avatar: React.FC<AvatarProps> = ({ size, name, visual }) => {
  const getColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getTextVariant = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return txtColors[Math.abs(hash) % txtColors.length];
  };

  const avatarClass = classNames(
    sizeClasses[size],
    name ? getColor(name) : "s-bg-slate-200",
    "s-flex s-items-center s-justify-center s-overflow-hidden"
  );

  return (
    <div className={avatarClass}>
      {typeof visual === "string" ? (
        <img
          src={visual}
          alt={name}
          className="s-h-full s-w-full s-object-cover"
        />
      ) : visual ? (
        visual
      ) : name ? (
        <span
          className={classNames(
            getTextVariant(name),
            textSize[size],
            "s-select-none s-font-medium"
          )}
        >
          {name[0].toUpperCase()}
        </span>
      ) : (
        <User className="s-h-1/2 s-w-1/2 s-opacity-20" /> // Default icon with size and slate-900 color
      )}
    </div>
  );
};
