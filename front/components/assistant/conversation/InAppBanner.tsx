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

interface InAppBannerProps {
  owner: WorkspaceType;
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

export function InAppBanner({ owner }: InAppBannerProps) {
  const [showInAppBanner, setShowInAppBanner] = useState(
    localStorage.getItem(getLocalStorageKey(owner)) !== "true"
  );

  const onDismiss = () => {
    localStorage.setItem(getLocalStorageKey(owner), "true");
    setShowInAppBanner(false);
  };

  const wrappedUrl = getWrappedUrl(owner);

  if (!showInAppBanner || !wrappedUrl) {
    return null;
  }

  const onLearnMore = () => {
    window.open(wrappedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className={cn(
        "hidden flex-col sm:flex",
        "rounded-2xl shadow-sm",
        "border border-border/0 dark:border-border-night/0",
        "mx-2 mb-2"
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
          variant="ghost"
          icon={XMarkIcon}
          className="absolute right-1 top-1 opacity-50"
          onClick={onDismiss}
        />
      </div>
    </div>
  );
}
