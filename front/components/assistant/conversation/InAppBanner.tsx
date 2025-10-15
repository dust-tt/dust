import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import { useState } from "react";

import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";

const localStorageKey = "frame-announcement-dismissed";
const docLink = "https://docs.dust.tt/docs/frames";

export function InAppBanner() {
  const [showInAppBanner, setShowInAppBanner] = useState(
    localStorage.getItem(localStorageKey) !== "true"
  );

  const onDismiss = () => {
    localStorage.setItem(localStorageKey, "true");
    setShowInAppBanner(false);
  };

  const onLearnMore = () => {
    window.open(docLink, "_blank", "noopener,noreferrer");
  };

  if (!showInAppBanner) {
    return null;
  }

  return (
    <div
      className={cn(
        "hidden flex-col sm:flex",
        "bg-background dark:bg-background-night",
        "rounded-2xl shadow-sm",
        "border border-border/0 dark:border-border-night/0",
        "mx-2 mb-2"
      )}
    >
      <div className="relative p-4">
        <div className="text-md mb-2 font-medium text-foreground dark:text-foreground-night">
          Introducing Frames ✨
        </div>
        <h4 className="mb-4 text-sm font-medium leading-tight text-primary dark:text-primary-night">
          Turn conversations into interactive visuals
        </h4>
        <Button
          variant="highlight"
          size="xs"
          onClick={withTracking(
            TRACKING_AREAS.FRAMES,
            "cta_frame_banner",
            onLearnMore
          )}
          label="Learn more"
        />
        <Button
          variant="ghost"
          icon={XMarkIcon}
          className="absolute right-1 top-1 opacity-50"
          onClick={onDismiss}
        />
      </div>
    </div>
  );
}
