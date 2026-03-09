import { Image } from "@app/lib/platform";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const ACADEMY_IMAGE_PATH = "/static/Academy_Banner.png";
const ACADEMY_BANNER_LOCAL_STORAGE_KEY = "academy-banner-dismissed";
const ACADEMY_BANNER_URL = "https://dust.tt/academy";

export function AcademyBanner() {
  const [showAcademyBanner, setShowAcademyBanner] = useState(() => {
    return localStorage.getItem(ACADEMY_BANNER_LOCAL_STORAGE_KEY) !== "true";
  });

  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(ACADEMY_BANNER_LOCAL_STORAGE_KEY, "true");
    setShowAcademyBanner(false);
  };

  const onLearnMore = () => {
    window.open(ACADEMY_BANNER_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <AnimatePresence>
      {showAcademyBanner ? (
        <motion.div
          initial={{ opacity: 100, translateY: "0%" }}
          transition={{ duration: 0.1, ease: "easeIn" }}
          exit={{ opacity: 0, translateY: "120%" }}
          className="relative z-10 mx-2 mb-2 hidden cursor-pointer flex-col rounded-2xl border border-border-dark bg-white shadow-md dark:border-border-night dark:bg-background-night sm:flex"
          onClick={withTracking(
            TRACKING_AREAS.ACADEMY,
            "cta_academy_banner",
            onLearnMore
          )}
        >
          <div className="relative w-full overflow-hidden rounded-t-2xl">
            <Image
              src={ACADEMY_IMAGE_PATH}
              alt="Dust Academy"
              width={300}
              height={98}
              className="w-full border-b border-border-dark object-cover dark:border-border-night"
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
              Introducing Dust Academy
            </div>
            <h4 className="mb-3 text-xs leading-tight text-muted-foreground dark:text-muted-foreground-night">
              Learn everything you need to get the most out of Dust, from your
              first agent to full automation.
            </h4>
            <Button
              variant="highlight"
              size="xs"
              label="Learn more"
              onClick={withTracking(
                TRACKING_AREAS.ACADEMY,
                "cta_academy_banner",
                onLearnMore
              )}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
