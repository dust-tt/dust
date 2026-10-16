import {
  FRENCH_LANGUAGE_BANNER_LOCAL_STORAGE_KEY,
  FrenchLanguageBanner,
  isFrenchBrowser,
} from "@app/components/assistant/conversation/FrenchLanguageBanner";
import { UserSettingsPopover } from "@app/components/UserSettingsPopover";
import { useUserLocale } from "@app/hooks/useUserLocale";
import type { WorkspaceType } from "@app/types/user";
import { AnimatePresence, domAnimation, LazyMotion } from "framer-motion";
import { useState } from "react";

interface StackedInAppBannersProps {
  owner: WorkspaceType;
}

/**
 * @cc [owner:sfriquet,label:product] french-banner-audience
 * `FrenchLanguageBanner` MUST be shown only when the browser's preferred language
 * (`navigator.language`) is French, the user locale is not `fr-FR`,
 * `FRENCH_LANGUAGE_BANNER_LOCAL_STORAGE_KEY` was not `"true"` when `StackedInAppBanners` mounted,
 * and the banner was not dismissed since.
 */
/**
 * @cc [owner:sfriquet,label:react] banners-exit-through-animate-presence
 * A banner MUST be rendered as a direct, keyed child of `AnimatePresence` only while it is
 * visible, so that hiding it unmounts it and plays its exit animation.
 */
export function StackedInAppBanners({ owner }: StackedInAppBannersProps) {
  const { userLocale } = useUserLocale({ owner });
  const [showFrenchLanguageBanner, setShowFrenchLanguageBanner] = useState(
    () =>
      localStorage.getItem(FRENCH_LANGUAGE_BANNER_LOCAL_STORAGE_KEY) !==
        "true" && isFrenchBrowser()
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <UserSettingsPopover
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        owner={owner}
        initialSection="customization"
      />
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {userLocale !== "fr-FR" && showFrenchLanguageBanner && (
            <FrenchLanguageBanner
              key="french-language-banner"
              owner={owner}
              onShowBanner={setShowFrenchLanguageBanner}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}
        </AnimatePresence>
      </LazyMotion>
    </>
  );
}
