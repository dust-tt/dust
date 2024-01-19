import React, { ComponentType, ReactNode } from "react";

import { classNames } from "@sparkle/lib/utils";

import { Icon, IconProps } from "./Icon";
import Spinner from "./Spinner";

type ChipProps = {
  size?: "xs" | "sm";
  color?:
    | "emerald"
    | "amber"
    | "slate"
    | "purple"
    | "warning"
    | "sky"
    | "pink"
    | "action"
    | "red";
  label?: string;
  children?: ReactNode;
  className?: string;
  isBusy?: boolean;
  icon?: ComponentType;
};

const sizeClasses = {
  xs: "s-h-7 s-text-xs s-font-medium s-px-3 s-gap-2",
  sm: "s-h-9 s-text-sm s-font-semibold s-px-3 s-gap-2.5",
};

const baseClasses =
  "s-rounded-lg s-inline-flex s-box-border s-border s-items-center";

export function Chip({
  size = "xs",
  color = "slate",
  label,
  children,
  className = "",
  isBusy = false,
  icon,
}: ChipProps) {
  const backgroundColor = `s-bg-${color}-100 s-border-${color}-200`;
  const textColor = `s-text-${color}-900`;

  const ChipClasses = classNames(
    baseClasses,
    sizeClasses[size],
    backgroundColor,
    textColor,
    className
  );

  return (
    <div className={ChipClasses} aria-label={label}>
      {icon && <Icon visual={icon} size={size as IconProps["size"]} />}
      {isBusy && <Spinner size={size} variant="darkGrey" />}
      {label && (
        <span
          className={classNames(
            textColor,
            "s-pointer s-grow s-cursor-default s-truncate"
          )}
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

interface ListChipProps {
  children: ReactNode;
  className?: string;
  isWrapping?: boolean;
}

Chip.List = function ({ children, className, isWrapping }: ListChipProps) {
  return (
    <div className={classNames(className ? className : "", "s-flex")}>
      <div
        className={classNames(
          "s-flex s-flex-row s-gap-2",
          isWrapping ? "s-flex-wrap" : ""
        )}
      >
        {children}
      </div>
    </div>
  );
};
