import React from "react";

import { classNames } from "@sparkle/lib/utils";

import { Icon, InformationCircleIcon } from "..";

export interface ContentMessageProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function ContentMessage({
  title,
  children,
  className = "",
}: ContentMessageProps) {
  return (
    <div
      className={classNames(
        "s-flex s-max-w-[500px] s-gap-2 s-rounded-2xl s-border s-border-amber-100 s-bg-amber-50 s-p-4",
        className
      )}
    >
      <Icon
        size="md"
        visual={InformationCircleIcon}
        className="s-text-amber-600"
      />
      <div className="s-flex s-flex-col s-gap-1">
        <div className="s-text-base s-font-semibold s-text-amber-600">
          {title}
        </div>
        <div className="s-text-sm s-text-element-800">{children}</div>
      </div>
    </div>
  );
}
