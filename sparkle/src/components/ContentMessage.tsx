import React from "react";

import { classNames } from "@sparkle/lib/utils";

import { Icon, InformationCircleIcon } from "..";

export interface ContentMessageProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  variant: "amber" | "pink";
}

ContentMessage.defaultProps = {
  variant: "amber" as const,
};

export function ContentMessage({
  title,
  variant,
  children,
  className = "",
}: ContentMessageProps) {
  const variantClasses = {
    border: `s-border-${variant}-100`,
    background: `s-bg-${variant}-50`,
    iconColor: `s-text-${variant}-800`,
    titleColor: `s-text-${variant}-800`,
  };

  return (
    <div
      className={classNames(
        "s-flex s-max-w-[500px] s-gap-2 s-rounded-2xl s-border s-p-4",
        variantClasses.border,
        variantClasses.background,
        className
      )}
    >
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
        <div className="s-text-sm s-text-element-800">{children}</div>
      </div>
    </div>
  );
}
