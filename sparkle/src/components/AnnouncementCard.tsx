import { cva } from "class-variance-authority";
import React from "react";

import { Button } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";

export const ANNOUNCEMENT_CARD_VARIANTS = ["default", "compact"] as const;

export type AnnouncementCardVariantType =
  (typeof ANNOUNCEMENT_CARD_VARIANTS)[number];

const variantClasses: Record<AnnouncementCardVariantType, string> = {
  default: "",
  compact: "",
};

const announcementCardVariants = cva(
  cn(
    "s-flex s-flex-col s-overflow-hidden",
    "s-bg-white dark:s-bg-black",
    "s-rounded-2xl s-shadow-md",
    "s-border s-border-border/0 dark:s-border-border-night/0"
  ),
  {
    variants: {
      variant: variantClasses,
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface AnnouncementCardProps {
  variant?: AnnouncementCardVariantType;
  className?: string;
  haveImage?: boolean;
  imageSrc?: string;
  announcementTitle?: string;
  announcementMessage: string;
  learnMoreHref?: string;
  onLearnMore?: () => void;
  onDismiss?: () => void;
  dismissible?: boolean;
}

export const AnnouncementCard = React.forwardRef<
  HTMLDivElement,
  AnnouncementCardProps
>(
  (
    {
      variant = "default",
      className,
      haveImage = false,
      imageSrc,
      announcementTitle = "New on Dust",
      announcementMessage,
      learnMoreHref,
      onLearnMore,
      onDismiss,
      dismissible = true,
      ...props
    },
    ref
  ) => {
    const handleLearnMore = () => {
      if (onLearnMore) {
        onLearnMore();
      } else if (learnMoreHref) {
        window.open(learnMoreHref, "_blank", "noopener,noreferrer");
      }
    };

    return (
      <div
        ref={ref}
        className={cn(announcementCardVariants({ variant }), className)}
        {...props}
      >
        {haveImage && imageSrc && (
          <div
            className="s-relative s-h-48 s-overflow-hidden s-rounded-t-2xl s-bg-cover s-bg-center s-bg-no-repeat"
            style={{ backgroundImage: `url(${imageSrc})` }}
          />
        )}

        <div className="s-p-4">
          <div className="s-mb-2 s-text-sm s-font-medium s-text-primary dark:s-text-primary-night">
            {announcementTitle}
          </div>
          <h4 className="s-mb-4 s-text-lg s-font-medium s-leading-tight s-text-foreground dark:s-text-foreground-night">
            {announcementMessage}
          </h4>
          <div className="s-flex s-items-center s-justify-between">
            <Button
              variant="highlight"
              size="sm"
              onClick={handleLearnMore}
              label="Learn more"
            />
            {dismissible && onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                label="Dismiss"
              />
            )}
          </div>
        </div>
      </div>
    );
  }
);

AnnouncementCard.displayName = "AnnouncementCard";
