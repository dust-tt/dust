import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import { useState } from "react";

import { useUserMetadata } from "@app/lib/swr/user";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types";

// TODO(dust-wrapped): Update background image for 2025 wrapped background image
const BACKGROUND_IMAGE_PATH = "/static/spiritavatar/Spirit_Black_1.jpg";
const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("${BACKGROUND_IMAGE_PATH}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
  backgroundSize: "auto",
};

const LOCAL_STORAGE_KEY_PREFIX = "dust-wrapped-dismissed";

type InAppBannerProps = {
  owner: WorkspaceType;
};

function getLocalStorageKey(owner: WorkspaceType) {
  return `${LOCAL_STORAGE_KEY_PREFIX}-${owner.sId}`;
}

export function InAppBanner({ owner }: InAppBannerProps) {
  const { metadata, isMetadataLoading, isMetadataError } =
    useUserMetadata("dust_wrapped");

  const [showInAppBanner, setShowInAppBanner] = useState(
    localStorage.getItem(getLocalStorageKey(owner)) !== "true"
  );

  const onDismiss = () => {
    localStorage.setItem(getLocalStorageKey(owner), "true");
    setShowInAppBanner(false);
  };

  if (
    isMetadataLoading ||
    isMetadataError ||
    !metadata ||
    !metadata.value ||
    !showInAppBanner
  ) {
    return null;
  }

  const onLearnMore = () => {
    window.open(metadata.value, "_blank", "noopener,noreferrer");
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
