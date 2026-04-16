import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const STEERING_IMAGE_PATH = "/static/Steering_Banner.png";
const STEERING_BANNER_LOCAL_STORAGE_KEY = "steering-banner-dismissed";
const STEERING_BANNER_URL =
  "https://docs.dust.tt/docs/steering-conversations-that-keep-up-with-you";

interface SteeringBannerProps {
  showSteeringBanner: boolean;
  onShowSteeringBanner: (open: boolean) => void;
}

function SteeringBanner({
  showSteeringBanner,
  onShowSteeringBanner,
}: SteeringBannerProps) {
  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(STEERING_BANNER_LOCAL_STORAGE_KEY, "true");
    onShowSteeringBanner(false);
  };

  const onLearnMore = () => {
    window.open(STEERING_BANNER_URL, "_blank", "noopener,noreferrer");
  };

  if (!showSteeringBanner) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 100, translateY: "0%" }}
      transition={{ duration: 0.1, ease: "easeIn" }}
      exit={{ opacity: 0, translateY: "120%" }}
      className="relative z-10 mx-2 mb-2 hidden max-w-[300px] cursor-pointer flex-col rounded-2xl border border-border-dark bg-white shadow-md dark:border-border-night dark:bg-background-night sm:flex"
      onClick={onLearnMore}
    >
      <div className="relative overflow-hidden rounded-t-2xl">
        <img
          src={STEERING_IMAGE_PATH}
          alt="Steering"
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
          Conversations that keep up with you
        </div>
        <h4 className="mb-3 text-xs leading-tight text-primary dark:text-primary-night">
          See every step as the agent works. Send a message mid-task and it
          adjusts.
        </h4>
        <Button
          variant="highlight"
          size="xs"
          label="Learn more"
          onClick={onLearnMore}
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
  const [showSteeringBanner, setShowSteeringBanner] = useState(
    () => localStorage.getItem(STEERING_BANNER_LOCAL_STORAGE_KEY) !== "true"
  );

  return (
    <AnimatePresence>
      <SteeringBanner
        key="steering-banner"
        showSteeringBanner={showSteeringBanner}
        onShowSteeringBanner={setShowSteeringBanner}
      />
    </AnimatePresence>
  );
}
