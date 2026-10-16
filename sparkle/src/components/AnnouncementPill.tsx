import { CARD_SHADOW } from "@sparkle/components/Card";
import { Icon } from "@sparkle/components/Icon";
import { LinkWrapper } from "@sparkle/components/LinkWrapper";
import { cn } from "@sparkle/lib/utils";
import React, { type ComponentType } from "react";

export interface AnnouncementPillProps {
  /** One-line text of the pill. */
  label: string;
  /** Icon or platform logo shown before the label. */
  icon?: ComponentType<{ className?: string }>;
  /** Makes the pill a link; it is static text otherwise. */
  href?: string;
  target?: string;
  rel?: string;
  className?: string;
}

const pillClasses = cn(
  "inline-flex max-w-full items-center gap-2 rounded-2xl px-2 py-1.5",
  "border border-border-dark bg-background",
  CARD_SHADOW
);

const linkClasses = cn(
  "cursor-pointer",
  "transition-[background-color] duration-100 ease-out motion-reduce:transition-none",
  "hover:bg-primary-100 hover:shadow-none",
  "active:bg-primary-150 active:shadow-none"
);

/**
 * A small pill that announces a feature or integration: an optional icon
 * or logo followed by a one-line label, rendered as a link when `href` is
 * set. Use it to surface a new capability in place, such as on the home
 * page; for a message that needs a colored variant, use ContentMessage
 * instead.
 *
 * @summary Pill announcing a feature, optionally linked.
 */
export function AnnouncementPill({
  label,
  icon,
  href,
  target,
  rel,
  className,
}: AnnouncementPillProps) {
  const classes = cn(pillClasses, href && linkClasses, className);
  const content = (
    <>
      <Icon
        visual={icon}
        size="xs"
        className="drop-shadow-[0px_1px_1.5px_rgba(0,0,0,0.08)]"
      />
      <span
        className={cn(
          "truncate copy-sm font-medium text-muted-foreground",
          "[text-shadow:0_1px_1.5px_rgba(0,0,0,0.08)]"
        )}
      >
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <LinkWrapper href={href} target={target} rel={rel} className={classes}>
        {content}
      </LinkWrapper>
    );
  }
  return <span className={classes}>{content}</span>;
}
