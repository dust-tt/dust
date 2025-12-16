import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import { useState } from "react";

import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { type WorkspaceType, isString } from "@app/types";

// TODO(dust-wrapped): Update background image for 2025 wrapped background image
const BACKGROUND_IMAGE_PATH = "/static/spiritavatar/Spirit_Black_1.jpg";
const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("${BACKGROUND_IMAGE_PATH}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
  backgroundSize: "auto",
};

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
        <div className="pt-20">
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
        </div>
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
