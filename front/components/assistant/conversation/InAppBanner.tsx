import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import { useState } from "react";

const localStorageKey = "frame-announcement-dismissed";
const docLink = "https://docs.dust.tt/docs/frames";

export const InAppBanner = () => {
  const [showInAppBanner, setShowInAppBanner] = useState(
    localStorage.getItem(localStorageKey) !== "true"
  );

  function onDismiss() {
    localStorage.setItem(localStorageKey, "true");
    setShowInAppBanner(false);
  }

  function onLearnMore() {
    window.open(docLink, "_blank", "noopener,noreferrer");
  }

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
      <div className="relative px-4 py-3">
        <div className="mb-2 text-sm font-medium text-primary dark:text-primary-night">
          What’s new
        </div>
        <h4 className="text-md mb-4 font-medium leading-tight text-foreground dark:text-foreground-night">
          Introducing Frames ✨
        </h4>
        <Button
          variant="highlight"
          size="xs"
          onClick={onLearnMore}
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
};
