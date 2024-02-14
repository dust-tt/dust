import React from "react";

import { classNames } from "@sparkle/lib/utils";

import { Icon, InformationCircleIcon } from "..";

export interface ContentMessageProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
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
}

ContentMessage.defaultProps = {
  variant: "amber" as const,
};

export function ContentMessage({
  title,
  variant,
  children,
  size = "md",
  className = "",
}: ContentMessageProps) {
  const variantClasses = {
    border: `s-border-${variant}-200`,
    background: `s-bg-${variant}-100`,
    iconColor: `s-text-${variant}-800`,
    titleColor: `s-text-${variant}-800`,
    textColor: `s-text-${variant}-950`,
  };

  return (
    <div
      className={classNames(
        "s-flex s-gap-2 s-border",
        variantClasses.border,
        variantClasses.background,
        size === "md"
          ? "s-max-w-[500px] s-rounded-2xl s-p-4"
          : "s-max-w-[380px] s-rounded-xl s-px-4 s-py-3",
        className
      )}
    >
      {size === "md" && (
        <>
          <Icon
            size="md"
            visual={InformationCircleIcon}
            className={classNames("s-shrink-0", variantClasses.iconColor)}
          />
          <div className="s-flex s-flex-col s-gap-2">
            <div
              className={classNames(
                "s-text-base s-font-semibold",
                variantClasses.titleColor
              )}
            >
              {title}
            </div>
            <div className={classNames("s-text-sm", variantClasses.textColor)}>
              {children}
            </div>
          </div>
        </>
      )}
      {size === "sm" && (
        <div className={classNames("s-text-sm", variantClasses.textColor)}>
          {children}
        </div>
      )}
    </div>
  );
}
