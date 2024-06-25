import React, { ReactNode } from "react";

import { DocumentText, Image } from "@sparkle/icons/stroke";
import { classNames } from "@sparkle/lib/utils";
import {
  Confluence,
  Drive,
  Github,
  Intercom,
  Microsoft,
  Notion,
  Slack,
} from "@sparkle/logo/platforms";

import { Avatar, CardButton, Icon, IconButton, Tooltip, XCircleIcon } from "..";

export type CitationType =
  | "confluence"
  | "document"
  | "github"
  | "google_drive"
  | "image"
  | "intercom"
  | "microsoft"
  | "notion"
  | "slack";

interface CitationProps {
  type?: CitationType;
  title: string;
  description?: string;
  index?: ReactNode;
  isBlinking?: boolean;
  href?: string;
  size?: "xs" | "sm";
  sizing?: "fixed" | "fluid";
  onClose?: () => void;
  avatarSrc?: string;
  imgSrc?: string;
}

const typeIcons = {
  confluence: Confluence,
  document: DocumentText,
  github: Github,
  google_drive: Drive,
  intercom: Intercom,
  microsoft: Microsoft,
  notion: Notion,
  slack: Slack,
  image: Image,
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
  avatarSrc,
  imgSrc,
}: CitationProps) {
  const cardContent = (
    <>
      {type === "image" && imgSrc && (
        <div
          className="s-absolute s-left-0 s-top-0 s-brightness-90 s-filter s-transition s-duration-200 s-ease-out hover:s-brightness-110 active:s-brightness-100 group-hover:s-brightness-110 group-hover:s-filter group-active:s-brightness-100"
          style={{
            backgroundImage: `url(${imgSrc})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            height: "100%",
            width: "100%",
          }}
        />
      )}
      <div className="s-flex s-items-center s-gap-2">
        {avatarSrc && <Avatar visual={avatarSrc} size="xs" />}
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
          <div
            className={classNames(
              type === "image"
                ? "s-z-50 s-h-5 s-w-5 s-rounded-full s-bg-slate-950/30"
                : ""
            )}
          >
            <IconButton
              icon={XCircleIcon}
              variant={type === "image" ? "white" : "tertiary"}
              onClick={onClose}
            />
          </div>
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
          "s-relative s-flex s-w-48 s-flex-none s-flex-col s-gap-1",
          sizing === "fluid" ? typeSizing[sizing] : typeSizing[sizing][size],
          size === "sm" ? "sm:s-w-64" : "",
          isBlinking ? "s-animate-[bgblink_500ms_3]" : "",
          type === "image" ? "s-min-h-20" : ""
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
          "s-relative s-flex s-w-48 s-flex-none s-flex-col s-gap-1",
          sizing === "fluid" ? typeSizing[sizing] : typeSizing[sizing][size],
          size === "sm" ? "sm:s-w-64" : "",
          isBlinking ? "s-animate-[bgblink_500ms_3]" : "",
          type === "image" ? "s-min-h-20" : ""
        )}
      >
        {cardContent}
      </CardButton>
    );
  }
}
