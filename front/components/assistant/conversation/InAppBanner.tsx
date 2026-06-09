import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button, Plus, XClose } from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const POD_IMAGE_PATH = "/static/Pod_Banner.png";
const POD_BANNER_LOCAL_STORAGE_KEY = "pod-banner-dismissed";
const POD_DOCS_URL = "https://docs.dust.tt/docs/pods-overview";

interface PodBannerProps {
  showPodBanner: boolean;
  onShowPodBanner: (open: boolean) => void;
  onCreatePod: () => void;
}

function PodBanner({
  showPodBanner,
  onShowPodBanner,
  onCreatePod,
}: PodBannerProps) {
  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(POD_BANNER_LOCAL_STORAGE_KEY, "true");
    onShowPodBanner(false);
  };

  const onLearnMore = () => {
    window.open(POD_DOCS_URL, "_blank", "noopener,noreferrer");
  };

  if (!showPodBanner) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 100, translateY: "0%" }}
      transition={{ duration: 0.1, ease: "easeIn" }}
      exit={{ opacity: 0, translateY: "120%" }}
      className="relative z-10 mx-2 mb-2 hidden max-w-[300px] flex-col rounded-2xl border border-border-dark bg-white shadow-md dark:border-border-night dark:bg-background-night sm:flex"
    >
      <div className="relative overflow-hidden rounded-t-2xl">
        <img
          src={POD_IMAGE_PATH}
          alt="Pods"
          width={300}
          height={98}
          className="h-[98px] w-[300px] border-b border-border-dark object-cover dark:border-border-night"
        />
        <Button
          variant="outline"
          icon={XClose}
          size="icon-xs"
          className="absolute right-1 top-1"
          onClick={onDismiss}
        />
      </div>
      <div className="relative px-4 py-3">
        <div className="mb-1 text-sm font-medium text-foreground dark:text-foreground-night">
          Introducing Pods: bring everyone into the room
        </div>
        <h4 className="mb-3 text-xs leading-tight text-primary dark:text-primary-night">
          Pods bring your team of humans and agents into one place with the
          context, tools and goals to move faster on complex work
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="highlight"
            size="xs"
            icon={Plus}
            label="Create a Pod"
            onClick={withTracking(
              TRACKING_AREAS.PODS,
              "create_pod_banner",
              onCreatePod
            )}
          />
          <Button
            variant="outline"
            size="xs"
            label="Learn more"
            onClick={withTracking(
              TRACKING_AREAS.PODS,
              "learn_more_pod_banner",
              onLearnMore
            )}
          />
        </div>
      </div>
    </motion.div>
  );
}

interface StackedInAppBannersProps {
  owner: { sId: string };
  onCreatePod: () => void;
}

export function StackedInAppBanners({
  owner: _owner,
  onCreatePod,
}: StackedInAppBannersProps) {
  const [showPodBanner, setShowPodBanner] = useState(
    () => localStorage.getItem(POD_BANNER_LOCAL_STORAGE_KEY) !== "true"
  );

  return (
    <AnimatePresence>
      <PodBanner
        key="pod-banner"
        showPodBanner={showPodBanner}
        onShowPodBanner={setShowPodBanner}
        onCreatePod={onCreatePod}
      />
    </AnimatePresence>
  );
}
