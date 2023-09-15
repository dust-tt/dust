import React, { ReactNode } from "react";

import { classNames } from "@sparkle/lib/utils";

type ChipProps = {
  size?: "xs" | "sm";
  color?: "emerald" | "amber" | "slate" | "violet";
  label?: string;
  children?: ReactNode;
  className?: string;
};

const sizeClasses = {
  xs: "s-py-1.5 s-text-xs s-font-medium s-px-3",
  sm: "s-py-2 s-text-sm s-font-semibold s-px-4",
};

const baseClasses =
  "s-rounded-lg s-inline-flex s-box-border s-border s-text-element-800";

export function Chip({
  size = "xs",
  color = "slate",
  label,
  children,
  className = "",
}: ChipProps) {
  const backgroundColor = (() => {
    switch (color) {
      case "emerald":
        return "s-bg-emerald-100 s-border-emerald-200";
      case "amber":
        return "s-bg-amber-100 s-border-amber-200";
      case "slate":
        return "s-bg-slate-100 s-border-slate-200";
      case "violet":
        return "s-bg-violet-100 s-border-violet-200";
    }
  })();

  const ChipClasses = classNames(
    baseClasses,
    sizeClasses[size],
    backgroundColor,
    className
  );

  return (
    <div className={ChipClasses} aria-label={label}>
      {label && (
        <span className="s-pointer s-grow s-cursor-default s-truncate">
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
}

Chip.List = function ({ children, className }: ListChipProps) {
  return (
    <div className={classNames(className ? className : "", "s-flex")}>
      <div className={"s-flex s-flex-row s-gap-2"}>{children}</div>
    </div>
  );
};
