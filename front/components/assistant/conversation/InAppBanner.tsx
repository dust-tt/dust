import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button, ChromeLogo, FirefoxLogo, XMarkIcon } from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const EXTENSION_IMAGE_PATH = "/static/Extension_Banner.png";
const EXTENSION_BANNER_LOCAL_STORAGE_KEY = "extension-banner-dismissed";
const EXTENSION_BANNER_URL =
  "https://chromewebstore.google.com/detail/dust/fnkfcndbgingjcbdhaofkcnhcjpljhdn";

const FIREFOX_EXTENSION_BANNER_LOCAL_STORAGE_KEY =
  "firefox-extension-banner-dismissed";
const FIREFOX_EXTENSION_BANNER_URL =
  "https://addons.mozilla.org/firefox/addon/dust/";

interface ExtensionBannerProps {
  showExtensionBanner: boolean;
  onShowExtensionBanner: (open: boolean) => void;
  type: "chrome" | "firefox";
}

function ExtensionBanner({
  showExtensionBanner,
  onShowExtensionBanner,
  type,
}: ExtensionBannerProps) {
  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (type === "chrome") {
      localStorage.setItem(EXTENSION_BANNER_LOCAL_STORAGE_KEY, "true");
    } else if (type === "firefox") {
      localStorage.setItem(FIREFOX_EXTENSION_BANNER_LOCAL_STORAGE_KEY, "true");
    }
    onShowExtensionBanner(false);
  };

  const onLearnMore = () => {
    if (type === "chrome") {
      window.open(EXTENSION_BANNER_URL, "_blank", "noopener,noreferrer");
    } else if (type === "firefox") {
      window.open(
        FIREFOX_EXTENSION_BANNER_URL,
        "_blank",
        "noopener,noreferrer"
      );
    }
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
          Meet the new {type === "chrome" ? "Chrome" : "Firefox"} Extension
        </div>
        <h4 className="mb-3 text-xs leading-tight text-primary dark:text-primary-night">
          Voice input, multi-tab awareness, and page interactions are here.
        </h4>
        <Button
          variant="highlight"
          size="xs"
          icon={type === "chrome" ? ChromeLogo : FirefoxLogo}
          label={`Install the ${type === "chrome" ? "Chrome" : "Firefox"} Extension`}
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
  const isFirefox =
    typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);

  const [showExtensionBanner, setShowExtensionBanner] = useState(() => {
    if (isFirefox) {
      return (
        localStorage.getItem(FIREFOX_EXTENSION_BANNER_LOCAL_STORAGE_KEY) !==
        "true"
      );
    }
    return localStorage.getItem(EXTENSION_BANNER_LOCAL_STORAGE_KEY) !== "true";
  });

  return (
    <AnimatePresence>
      <ExtensionBanner
        key="extension-banner"
        showExtensionBanner={showExtensionBanner}
        onShowExtensionBanner={setShowExtensionBanner}
        type={isFirefox ? "firefox" : "chrome"}
      />
    </AnimatePresence>
  );
}
