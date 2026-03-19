import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button, ChromeLogo, XMarkIcon } from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const SIDEKICK_IMAGE_PATH = "/static/Sidekick_Banner.png";
const SIDEKICK_BANNER_LOCAL_STORAGE_KEY = "sidekick-banner-dismissed";
const SIDEKICK_BANNER_URL = "https://docs.dust.tt/docs/agent-builder-sidekick";

const EXTENSION_IMAGE_PATH = "/static/Extension_Banner.png";
const EXTENSION_BANNER_LOCAL_STORAGE_KEY = "extension-banner-dismissed";
const EXTENSION_BANNER_URL =
  "https://chromewebstore.google.com/detail/dust/fnkfcndbgingjcbdhaofkcnhcjpljhdn";

interface SidekickBannerProps {
  showSidekickBanner: boolean;
  setShowSidekickBanner: (show: boolean) => void;
}

function SidekickBanner({
  showSidekickBanner,
  setShowSidekickBanner,
}: SidekickBannerProps) {
  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(SIDEKICK_BANNER_LOCAL_STORAGE_KEY, "true");
    setShowSidekickBanner(false);
  };

  const onLearnMore = () => {
    window.open(SIDEKICK_BANNER_URL, "_blank", "noopener,noreferrer");
  };

  if (!showSidekickBanner) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 100, translateY: "0%" }}
      transition={{ duration: 0.1, ease: "easeIn" }}
      exit={{ opacity: 0, translateY: "120%" }}
      className="relative z-10 mx-2 mb-2 hidden max-w-[300px] cursor-pointer flex-col rounded-2xl border border-border-dark bg-white shadow-md dark:border-border-night dark:bg-background-night sm:flex"
      onClick={withTracking(
        TRACKING_AREAS.SIDEKICK,
        "cta_sidekick_banner",
        onLearnMore
      )}
    >
      <div className="relative overflow-hidden rounded-t-2xl">
        <img
          src={SIDEKICK_IMAGE_PATH}
          alt="Sidekick"
          width={300}
          height={98}
          className="h-[98px] w-[300px] border-b border-border-dark object-cover dark:border-border-night"
        />
        <Button
          variant="outline"
          icon={XMarkIcon}
          className="absolute right-1 top-1 opacity-80"
          onClick={onDismiss}
        />
      </div>
      <div className="relative px-4 py-3">
        <div className="mb-1 text-sm font-medium text-foreground dark:text-foreground-night">
          Introducing Sidekick
        </div>
        <h4 className="mb-3 text-xs leading-tight text-primary dark:text-primary-night">
          Turn agent building from a blank-page problem into a guided
          conversation
        </h4>
        <Button
          variant="highlight"
          size="xs"
          label="Learn more"
          onClick={withTracking(
            TRACKING_AREAS.SIDEKICK,
            "cta_sidekick_banner",
            onLearnMore
          )}
        />
      </div>
    </motion.div>
  );
}

interface ExtensionBannerProps {
  showExtensionBanner: boolean;
  onHideBanner: () => void;
}

function ExtensionBanner({
  showExtensionBanner,
  onHideBanner,
}: ExtensionBannerProps) {
  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(EXTENSION_BANNER_LOCAL_STORAGE_KEY, "true");
    onHideBanner();
  };

  const onLearnMore = () => {
    window.open(EXTENSION_BANNER_URL, "_blank", "noopener,noreferrer");
  };

  if (!showExtensionBanner) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 100, translateY: "0%" }}
      transition={{ duration: 0.1, ease: "easeIn" }}
      exit={{ opacity: 0, translateY: "120%" }}
      className="relative z-10 mx-2 mb-2 hidden max-w-[300px] cursor-pointer flex-col rounded-2xl border border-border-dark bg-white shadow-md dark:border-border-night dark:bg-background-night sm:flex"
      onClick={withTracking(
        TRACKING_AREAS.EXTENSION,
        "cta_extension_banner",
        onLearnMore
      )}
    >
      <div className="relative overflow-hidden rounded-t-2xl">
        <img
          src={EXTENSION_IMAGE_PATH}
          alt="Extension"
          width={300}
          height={98}
          className="h-[98px] w-[300px] border-b border-border-dark object-cover dark:border-border-night"
        />
        <Button
          variant="outline"
          icon={XMarkIcon}
          size="icon-xs"
          className="absolute right-1 top-1"
          onClick={onDismiss}
        />
      </div>
      <div className="relative px-4 py-3">
        <div className="mb-1 text-sm font-medium text-foreground dark:text-foreground-night">
          Meet the new Chrome Extension
        </div>
        <h4 className="mb-3 text-xs leading-tight text-primary dark:text-primary-night">
          Voice input, multi-tab awareness, and page interactions are here.
        </h4>
        <Button
          variant="highlight"
          size="xs"
          icon={ChromeLogo}
          label="Install the Chrome Extension"
          onClick={withTracking(
            TRACKING_AREAS.EXTENSION,
            "cta_extension_banner",
            onLearnMore
          )}
        />
      </div>
    </motion.div>
  );
}

interface StackedInAppBannersProps {
  owner: { sId: string };
}

export function StackedInAppBanners({
  owner: _owner,
}: StackedInAppBannersProps) {
  const [activeBanner, setActiveBanner] = useState<
    "sidekick" | "extension" | null
  >(() => {
    if (localStorage.getItem(SIDEKICK_BANNER_LOCAL_STORAGE_KEY) !== "true") {
      return "sidekick";
    }
    if (localStorage.getItem(EXTENSION_BANNER_LOCAL_STORAGE_KEY) !== "true") {
      return "extension";
    }
    return null;
  });

  const handleHideBanner = () => {
    setActiveBanner(null);
  };

  return (
    <AnimatePresence>
      <SidekickBanner
        key="sidekick-banner"
        showSidekickBanner={activeBanner === "sidekick"}
        setShowSidekickBanner={handleHideBanner}
      />
      <ExtensionBanner
        key="extension-banner"
        showExtensionBanner={activeBanner === "extension"}
        onHideBanner={handleHideBanner}
      />
    </AnimatePresence>
  );
}
