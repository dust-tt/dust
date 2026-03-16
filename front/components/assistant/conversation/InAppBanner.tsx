import { Image } from "@app/lib/platform";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const SIDEKICK_IMAGE_PATH = "/static/Sidekick_Banner.png";
const SIDEKICK_BANNER_LOCAL_STORAGE_KEY = "sidekick-banner-dismissed";
const SIDEKICK_BANNER_URL = "https://docs.dust.tt/docs/agent-builder-sidekick";

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
        <Image
          src={SIDEKICK_IMAGE_PATH}
          alt="Sidekick"
          width={300}
          height={98}
          className="h-[98px] w-[300px] border-b border-border-dark object-cover dark:border-border-night"
          priority
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

interface StackedInAppBannersProps {
  owner: { sId: string };
}

export function StackedInAppBanners({
  owner: _owner,
}: StackedInAppBannersProps) {
  const [showSidekickBanner, setShowSidekickBanner] = useState(() => {
    return localStorage.getItem(SIDEKICK_BANNER_LOCAL_STORAGE_KEY) !== "true";
  });

  return (
    <AnimatePresence>
      <SidekickBanner
        showSidekickBanner={showSidekickBanner}
        setShowSidekickBanner={setShowSidekickBanner}
      />
    </AnimatePresence>
  );
}
