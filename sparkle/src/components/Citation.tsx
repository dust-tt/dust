import React, { ReactNode } from "react";

import { DocumentText } from "@sparkle/icons/stroke";
import { classNames } from "@sparkle/lib/utils";
import {
  Confluence,
  Drive,
  Github,
  Intercom,
  Notion,
  Slack,
} from "@sparkle/logo/platforms";

import {
  Avatar,
  ExternalLinkIcon,
  Icon,
  IconButton,
  Tooltip,
  XCircleIcon,
} from "..";

interface CitationProps {
  type?:
    | "confluence"
    | "slack"
    | "google_drive"
    | "github"
    | "notion"
    | "intercom"
    | "document";
  title: string;
  description?: string;
  index?: ReactNode;
  isBlinking?: boolean;
  href?: string;
  onClose?: () => void;
  avatarUrl?: string;
}

const typeIcons = {
  confluence: Confluence,
  document: DocumentText,
  github: Github,
  google_drive: Drive,
  intercom: Intercom,
  notion: Notion,
  slack: Slack,
};

export function Citation({
  title,
  index,
  type = "document",
  description,
  href,
  onClose,
  isBlinking = false,
  avatarUrl,
}: CitationProps) {
  return (
    <div
      className={classNames(
        "s-flex s-w-48 s-flex-none s-flex-col s-gap-1 s-rounded-xl s-border s-border-structure-100 s-bg-white s-p-3 s-shadow-sm sm:s-w-64",
        isBlinking ? "s-animate-[bgblink_500ms_3]" : ""
      )}
    >
      <div className="s-flex s-items-center s-gap-2">
        {avatarUrl && <Avatar visual={avatarUrl} size="xs" />}
        {index && (
          <div className="s-flex s-h-5 s-w-5 s-items-center s-justify-center s-rounded-full s-border s-border-violet-200 s-bg-violet-100 s-text-xs s-font-semibold s-text-element-800">
            {index}
          </div>
        )}
        <Icon
          visual={typeIcons[type]}
          size="sm"
          className="s-text-element-700"
        />
        <div className="s-flex-grow s-text-xs" />
        {href && (
          <a target="_blank" rel="noopener noreferrer" href={href}>
            <IconButton icon={ExternalLinkIcon} size="sm" variant="secondary" />
          </a>
        )}
        {onClose && (
          <IconButton
            icon={XCircleIcon}
            size="sm"
            variant="tertiary"
            onClick={onClose}
          />
        )}
      </div>
      <Tooltip label={title} position="above">
        <div className="s-line-clamp-1 s-text-sm s-font-bold s-text-element-900">
          {title}
        </div>
      </Tooltip>
      {description && (
        <div className="s-line-clamp-2 s-text-xs s-font-normal  s-text-element-700">
          {description}
        </div>
      )}
    </div>
  );
}
