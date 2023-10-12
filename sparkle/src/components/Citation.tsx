import React, { ReactNode } from "react";

import { DocumentText } from "@sparkle/icons/stroke";
import { classNames } from "@sparkle/lib/utils";
import { Drive, Github, Notion, Slack } from "@sparkle/logo/platforms";

import { ExternalLinkIcon, Icon, IconButton } from "..";

interface CitationProps {
  type?: "slack" | "google_drive" | "github" | "notion" | "document";
  title: string;
  description?: string;
  index?: ReactNode;
  isBlinking?: boolean;
  href?: string;
}

const typeIcons = {
  slack: Slack,
  google_drive: Drive,
  github: Github,
  notion: Notion,
  document: DocumentText,
};

export function Citation({
  title,
  index,
  type = "document",
  description,
  href,
  isBlinking = false,
}: CitationProps) {
  return (
    <div
      className={classNames(
        "w-48 s-flex s-flex-none s-flex-col s-gap-1 s-rounded-xl s-border s-border-structure-100 s-bg-white s-p-3 s-shadow-sm sm:s-w-64",
        isBlinking ? "animate-[bgblink_500ms_3]" : ""
      )}
    >
      <div className="s-flex s-items-center s-gap-2">
        {index && (
          <div className="s-flex s-h-5 s-w-5 s-items-center s-justify-center s-rounded-full s-border s-border-violet-200 s-bg-violet-100 s-text-xs s-font-semibold s-text-element-800">
            {index}
          </div>
        )}
        <Icon visual={typeIcons[type]} size="sm" />
        <div className="s-flex-grow s-text-xs" />
        {href && (
          <a target="_blank" rel="noopener noreferrer" href={href}>
            <IconButton icon={ExternalLinkIcon} size="sm" variant="primary" />
          </a>
        )}
      </div>
      <div className="s-text-sm s-font-bold s-text-element-900">{title}</div>
      {description && (
        <div className="s-text-xs s-font-normal s-text-element-700">
          {description}
        </div>
      )}
    </div>
  );
}
