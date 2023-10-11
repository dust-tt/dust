import React, { ReactNode } from "react";

import { classNames } from "@sparkle/lib/utils";

import Spinner from "./Spinner";

type ChipProps = {
  size?: "xs" | "sm";
  color?:
    | "emerald"
    | "amber"
    | "slate"
    | "violet"
    | "warning"
    | "sky"
    | "pink"
    | "indigo"
    | "action";
  label?: string;
  children?: ReactNode;
  className?: string;
  isBusy?: boolean;
};

const sizeClasses = {
  xs: "s-py-1.5 s-text-xs s-font-medium s-px-3 s-gap-2",
  sm: "s-py-2 s-text-sm s-font-semibold s-px-3 s-gap-3",
};

const baseClasses = "s-rounded-lg s-inline-flex s-box-border s-border";

export function Chip({
  size = "xs",
  color = "slate",
  label,
  children,
  className = "",
  isBusy = false,
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
