import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import { useState } from "react";

import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types";
import { isString } from "@app/types";

const BACKGROUND_IMAGE_PATH = "/static/year-in-review-bg.png";
const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("${BACKGROUND_IMAGE_PATH}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
  backgroundSize: "cover",
};

const YEAR_IN_REVIEW_TITLE = "/static/year-in-review-title.svg";

const LOCAL_STORAGE_KEY_PREFIX = "dust-wrapped-dismissed";
const MENTION_BANNER_LOCAL_STORAGE_KEY = "mention-banner-dismissed";

const MENTION_BANNER_URL = "https://docs.dust.tt/docs/collaboration";

const EXIT_ANIMATION_CLASSNAME =
  "translate-y-[-150%] opacity-0 transition-opacity transition-transform duration-300";

interface InAppBannerProps {
  owner: WorkspaceType;
  showMentionBanner: boolean;
}

function getLocalStorageKey(owner: WorkspaceType) {
  return `${LOCAL_STORAGE_KEY_PREFIX}-${owner.sId}`;
}

function getWrappedUrl(owner: WorkspaceType): string | null {
  const metadata = owner.metadata;
  if (!metadata) {
    return null;
  }
  const wrappedUrl = metadata.wrappedUrl;
  if (wrappedUrl && isString(wrappedUrl)) {
    return wrappedUrl;
  }
  return null;
}

export function InAppBanner({ owner, showMentionBanner }: InAppBannerProps) {
  const [showInAppBanner, setShowInAppBanner] = useState(true);

  const onDismiss = () => {
    localStorage.setItem(getLocalStorageKey(owner), "true");
    setShowInAppBanner((prev) => !prev);
  };

  const wrappedUrl = getWrappedUrl(owner);

  // if (!showInAppBanner) {
  //   return null;
  // }

  const onLearnMore = () => {
    window.open(wrappedUrl, "_blank", "noopener,noreferrer");
  };

  console.log("showMentionBanner", showMentionBanner);
  console.log("showInAppBanner", showInAppBanner);

  return (
    <div
      className={cn(
        "hidden flex-col sm:flex",
        // "absolute left-0 top-[-1]",
        "rounded-2xl shadow-sm",
        "border border-border/0 dark:border-border-night/0",
        "mx-2 mb-2",
        showMentionBanner
          ? "translate-y-[-20%] scale-95"
          : "translate-y-none scale-100",
        "transition-transform",
        !showInAppBanner && EXIT_ANIMATION_CLASSNAME
      )}
      style={BACKGROUND_IMAGE_STYLE_PROPS}
    >
      <div className="relative p-4">
        <img
          src={YEAR_IN_REVIEW_TITLE}
          alt="Year in Review"
          className="mb-4 h-12"
        />
        <Button
          variant="highlight"
          size="xs"
          onClick={withTracking(
            TRACKING_AREAS.DUST_WRAPPED,
            "cta_dust_wrapped_banner",
            onLearnMore
          )}
          label="Open your holiday recap"
        />
        <Button
          variant="outline"
          icon={XMarkIcon}
          className="absolute right-1 top-1 opacity-80"
          onClick={onDismiss}
        />
      </div>
    </div>
  );
}

export function MentionBanner({
  showMentionBanner,
  setShowMentionBanner,
}: InAppBannerProps) {
  const onDismiss = () => {
    localStorage.setItem(MENTION_BANNER_LOCAL_STORAGE_KEY, "true");
    setShowMentionBanner((prev) => !prev);
  };

  const onLearnMore = () => {
    window.open(MENTION_BANNER_URL, "_blank", "noopener,noreferrer");
  };

  // if (!showMentionBanner) {
  //   return null;
  // }

  return (
    <div
      className={cn(
        "hidden flex-col sm:flex",
        // "absolute top-0",
        "bg-white",
        "rounded-2xl shadow-md",
        "border border-border/0 dark:border-border-night/0",
        "mx-2 mb-2",
        "relative z-10",
        showMentionBanner
          ? "opacity-1 translate-y-[100%]"
          : EXIT_ANIMATION_CLASSNAME
      )}
    >
      <div className="relative p-4">
        <div className="text-md mb-2 font-medium text-foreground dark:text-foreground-night">
          Introducing Triggers ✨
        </div>
        <h4 className="mb-4 text-sm font-medium leading-tight text-primary dark:text-primary-night">
          Make your agents work while you're away.
        </h4>
        <Button
          variant="highlight"
          size="xs"
          onClick={withTracking(
            TRACKING_AREAS.DUST_WRAPPED,
            "cta_dust_wrapped_banner",
            onLearnMore
          )}
          label="Learn more"
        />
        <Button
          variant="outline"
          icon={XMarkIcon}
          className="absolute right-1 top-1 opacity-80"
          onClick={onDismiss}
        />
      </div>
    </div>
  );
}
