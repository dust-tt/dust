import { Button } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export interface MessageCardProps {
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
          "rounded-2xl shadow-md",
          "border border-transparent",
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
