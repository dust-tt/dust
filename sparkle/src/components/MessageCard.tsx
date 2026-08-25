import { Button } from "@sparkle/components/Button";
import { CARD_SHADOW } from "@sparkle/components/Card";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export interface MessageCardProps {
  className?: string;
  /** Whether to show an image section at the top of the card. */
  haveImage?: boolean;
  /** URL of the image displayed in the top section (requires `haveImage`). */
  imageSrc?: string;
  /** Title shown above the announcement message. */
  announcementTitle?: string;
  /** The main announcement message. */
  announcementMessage: string;
  /** URL opened in a new tab by the "Learn more" button when `onLearnMore` is not provided. */
  learnMoreHref?: string;
  /** Called when the "Learn more" button is clicked; takes precedence over `learnMoreHref`. */
  onLearnMore?: () => void;
  /** Called when the dismiss button is clicked; the button only renders when provided. */
  onDismiss?: () => void;
  /** Whether the card can be dismissed. */
  dismissible?: boolean;
}

/**
 * A dismissible message card designed for sidebar usage, featuring an optional
 * image section and a feature-announcement section with a "Learn more" action.
 * Use it to surface product announcements in a sidebar.
 * @summary Dismissible sidebar announcement card.
 */
export const MessageCard = React.forwardRef<HTMLDivElement, MessageCardProps>(
  (
    {
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
        className={cn(
          "flex flex-col overflow-hidden",
          "bg-background",
          "rounded-2xl border border-border",
          CARD_SHADOW,
          className
        )}
        {...props}
      >
        {haveImage && imageSrc && (
          <div
            className="relative h-48 overflow-hidden rounded-t-2xl bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${imageSrc})` }}
          />
        )}

        <div className="p-4">
          <div className="mb-2 text-sm font-medium text-primary">
            {announcementTitle}
          </div>
          <h4 className="mb-4 text-lg font-medium leading-tight text-foreground">
            {announcementMessage}
          </h4>
          <div className="flex items-center justify-between">
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

MessageCard.displayName = "MessageCard";
