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

import { Avatar, CardButton, Icon, IconButton, Tooltip, XCircleIcon } from "..";

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
  size?: "xs" | "sm";
  sizing?: "fixed" | "fluid";
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

const typeSizing = {
  fixed: { xs: "s-w-48", sm: "s-w-64" },
  fluid: "s-w-full",
};

export function Citation({
  title,
  index,
  type = "document",
  size = "sm",
  sizing = "fixed",
  description,
  href,
  onClose,
  isBlinking = false,
  avatarUrl,
}: CitationProps) {
  // Content of the card as a reusable variable to avoid duplication
  const cardContent = (
    <>
      <div className="s-flex s-items-center s-gap-2">
        {avatarUrl && <Avatar visual={avatarUrl} size="xs" />}
        {index && (
          <div
            className={classNames(
              "s-flex s-items-center s-justify-center s-rounded-full s-border s-border-violet-200 s-bg-violet-100 s-text-xs s-font-semibold s-text-element-800",
              size === "sm" ? "s-h-5 s-w-5" : "s-h-4 s-w-4"
            )}
          >
            {index}
          </div>
        )}
        <Icon visual={typeIcons[type]} className="s-text-element-700" />
        <div className="s-flex-grow s-text-xs" />
        {onClose && (
          <IconButton icon={XCircleIcon} variant="tertiary" onClick={onClose} />
        )}
      </div>
      <Tooltip label={title} position="above">
        <div
          className={classNames(
            "s-line-clamp-1 s-text-sm s-text-element-800",
            size === "sm" ? "s-font-bold" : "s-font-semibold"
          )}
        >
          {title}
        </div>
      </Tooltip>
      {description && (
        <div className="s-line-clamp-2 s-text-xs s-font-normal s-text-element-700">
          {description}
        </div>
      )}
    </>
  );
  if (href) {
    return (
      <CardButton
        variant="secondary"
        size="sm"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classNames(
          "s-flex s-w-48 s-flex-none s-flex-col s-gap-1",
          sizing === "fluid" ? typeSizing[sizing] : typeSizing[sizing][size],
          size === "sm" ? "sm:s-w-64" : "",
          isBlinking ? "s-animate-[bgblink_500ms_3]" : ""
        )}
      >
        {cardContent}
      </CardButton>
    );
  } else {
    return (
      <CardButton
        variant="secondary"
        size="sm"
        className={classNames(
          "s-flex s-w-48 s-flex-none s-flex-col s-gap-1",
          sizing === "fluid" ? typeSizing[sizing] : typeSizing[sizing][size],
          size === "sm" ? "sm:s-w-64" : "",
          isBlinking ? "s-animate-[bgblink_500ms_3]" : ""
        )}
      >
        {cardContent}
      </CardButton>
    );
  }
}
