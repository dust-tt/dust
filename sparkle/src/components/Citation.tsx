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
  Zendesk,
} from "@sparkle/logo/platforms";

import {
  Avatar,
  CardButton,
  Icon,
  IconButton,
  Spinner,
  Tooltip,
  XCircleIcon,
} from "..";

export type CitationType =
  | "confluence"
  | "document"
  | "github"
  | "google_drive"
  | "image"
  | "intercom"
  | "microsoft"
  | "zendesk"
  | "notion"
  | "slack";

interface CitationProps {
  avatarSrc?: string;
  description?: string;
  href?: string;
  imgSrc?: string;
  index?: ReactNode;
  isBlinking?: boolean;
  isLoading?: boolean;
  onClose?: () => void;
  size?: "xs" | "sm";
  sizing?: "fixed" | "fluid";
  title: string;
  type?: CitationType;
}

const typeIcons = {
  confluence: Confluence,
  document: DocumentText,
  github: Github,
  google_drive: Drive,
  intercom: Intercom,
  microsoft: Microsoft,
  zendesk: Zendesk,
  notion: Notion,
  slack: Slack,
  image: Image,
};

const typeSizing = {
  fixed: { xs: "s-w-48", sm: "s-w-64" },
  fluid: "s-w-full",
};

export function Citation({
  avatarSrc,
  description,
  href,
  imgSrc,
  index,
  isBlinking = false,
  isLoading,
  onClose,
  size = "sm",
  sizing = "fixed",
  title,
  type = "document",
}: CitationProps) {
  const cardContent = (
    <>
      {type === "image" && imgSrc && (
        <div
          className={classNames(
            "s-absolute s-left-0 s-top-0 s-brightness-90 s-filter s-transition s-duration-200 s-ease-out active:s-brightness-100 group-active:s-brightness-100",
            href
              ? "hover:s-brightness-110 group-hover:s-brightness-110 group-hover:s-filter"
              : ""
          )}
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

        {!isLoading && (
          <Icon visual={typeIcons[type]} className="s-text-element-700" />
        )}
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
      <div
        className={classNames(
          "s-line-clamp-1 s-text-sm s-text-element-800",
          size === "sm" ? "s-font-bold" : "s-font-semibold"
        )}
      >
        {title}
      </div>

      {description && (
        <div className="s-line-clamp-2 s-text-xs s-font-normal s-text-element-700">
          {description}
        </div>
      )}
    </>
  );

  const cardButton = (
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
      {...(href && { href, target: "_blank", rel: "noopener noreferrer" })}
    >
      {isLoading && (
        <div className="s-absolute s-inset-0 s-flex s-items-center s-justify-center">
          <Spinner size="xs" variant="color" />
        </div>
      )}
      <div className={isLoading ? "s-opacity-50" : ""}>{cardContent}</div>
    </CardButton>
  );
  return href ? (
    <Tooltip label={title} position="above">
      {cardButton}
    </Tooltip>
  ) : (
    cardButton
  );
}
