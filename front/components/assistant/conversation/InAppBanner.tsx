import { Image } from "@app/lib/platform";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types/user";
import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const SKILLS_IMAGE_PATH = "/static/Skills_Banner.jpg";
const SKILLS_BANNER_LOCAL_STORAGE_KEY = "skills-banner-dismissed";
const SKILLS_BANNER_URL = "https://docs.dust.tt/docs/skills";

interface StackedInAppBannersProps {
  owner: WorkspaceType;
}

export function StackedInAppBanners({
  owner: _owner,
}: StackedInAppBannersProps) {
  const [showSkillsBanner, setShowSkillsBanner] = useState(() => {
    return localStorage.getItem(SKILLS_BANNER_LOCAL_STORAGE_KEY) !== "true";
  });

  return (
    <div className="absolute bottom-0 left-0 z-20 w-full">
      <SkillsBanner
        showSkillsBanner={showSkillsBanner}
        setShowSkillsBanner={setShowSkillsBanner}
      />
    </div>
  );
}

export function SkillsBanner({
  showSkillsBanner,
  setShowSkillsBanner,
}: {
  showSkillsBanner: boolean;
  setShowSkillsBanner: (show: boolean) => void;
}) {
  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(SKILLS_BANNER_LOCAL_STORAGE_KEY, "true");
    setShowSkillsBanner(false);
  };

  const onLearnMore = () => {
    window.open(SKILLS_BANNER_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <AnimatePresence>
      {showSkillsBanner ? (
        <motion.div
          initial={{ opacity: 100, translateY: "0%" }}
          transition={{ duration: 0.1, ease: "easeIn" }}
          exit={{ opacity: 0, translateY: "120%" }}
          className="relative z-10 mx-2 mb-2 hidden cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-dark bg-white shadow-md dark:border-border-night dark:bg-background-night sm:flex"
          onClick={withTracking(
            TRACKING_AREAS.SKILLS,
            "cta_skills_banner",
            onLearnMore
          )}
        >
          <div className="relative w-full">
            <Image
              src={SKILLS_IMAGE_PATH}
              alt="Introducing Skills"
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
              Introducing Skills
            </div>
            <h4 className="text-xs leading-tight text-primary dark:text-primary-night">
              Extend your agent's capabilities with modular, specialized Skills
            </h4>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
