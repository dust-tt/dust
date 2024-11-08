import React, { ComponentType } from "react";

import { Icon } from "@sparkle/components/Icon";
import { classNames, cn } from "@sparkle/lib/utils";

export interface ContentMessageProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?:
    | "emerald"
    | "amber"
    | "slate"
    | "purple"
    | "warning"
    | "sky"
    | "pink"
    | "action"
    | "red";
  icon?: ComponentType;
}

export function ContentMessage({
  title,
  variant = "amber",
  children,
  size = "md",
  className = "",
  icon,
}: ContentMessageProps) {
  const variantClasses = {
    background: `s-bg-${variant}-100`,
    iconColor: `s-text-${variant}-800`,
    titleColor: `s-text-${variant}-800`,
    textColor: `s-text-${variant}-950`,
  };
  const sizeMaxWidthClasses = {
    lg: "",
    md: "s-max-w-[500px]",
    sm: "s-max-w-[380px]",
  };

  return (
    <div
      className={cn(
        "s-flex s-flex-col s-gap-2 s-rounded-2xl s-p-4",
        variantClasses.background,
        sizeMaxWidthClasses[size],
        className
      )}
    >
      {(icon || title) && (
        <div className="s-flex s-items-center s-gap-1.5">
          {icon && (
            <Icon
              size="sm"
              visual={icon}
              className={classNames("s-shrink-0", variantClasses.iconColor)}
            />
          )}
          {title && (
            <div
              className={classNames(
                "s-text-base s-font-semibold",
                variantClasses.titleColor
              )}
            >
              {title}
            </div>
          )}
        </div>
      )}
      <div className={classNames("s-text-sm", variantClasses.textColor)}>
        {children}
      </div>
    </div>
  );
}
