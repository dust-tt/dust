import React, { ComponentType, ReactNode } from "react";

import { classNames } from "@sparkle/lib/utils";

import { ExternalLinkIcon, Icon, IconButton } from "..";

interface CitationProps {
  title: string;
  index?: ReactNode;
  icon: ComponentType;
  lastHoveredReference: number;
  href: string;
  document: Document;
}

export function Citation({
  title,
  index,
  icon,
  href,
  lastHoveredReference,
}: CitationProps) {
  return (
    <div
      className={classNames(
        "flex w-48 flex-none flex-col gap-2 rounded-xl border border-structure-100 p-3 sm:w-64",
        lastHoveredReference === index ? "animate-[bgblink_500ms_3]" : ""
      )}
    >
      <div className="flex items-center gap-1.5">
        {index && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-violet-200 bg-violet-100 text-xs font-semibold text-element-800">
            {index}
          </div>
        )}
        <Icon visual={icon} size="sm" />
        <div className="flex-grow text-xs" />
        <a target="_blank" rel="noopener noreferrer" href={href}>
          <IconButton icon={ExternalLinkIcon} size="sm" variant="primary" />
        </a>
      </div>
      <div className="text-xs font-bold text-element-900">{title}</div>
    </div>
  );
}
