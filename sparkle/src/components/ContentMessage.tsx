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
  return (
    <div
      className={classNames(
        `s-flex s-max-w-[500px] s-gap-2 s-rounded-2xl s-border s-border-${variant}-100 s-bg-${variant}-50 s-p-4`,
        className
      )}
    >
      <Icon
        size="md"
        visual={InformationCircleIcon}
        className={`s-shrink-0 s-text-${variant}-600`}
      />
      <div className="s-flex s-flex-col s-gap-2">
        <div className={`s-text-base s-font-semibold s-text-${variant}-600`}>
          {title}
        </div>
        <div className="s-text-sm s-text-element-800">{children}</div>
      </div>
    </div>
  );
}
