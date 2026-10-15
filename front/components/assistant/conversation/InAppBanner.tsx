import {
  FRENCH_LANGUAGE_BANNER_LOCAL_STORAGE_KEY,
  FrenchLanguageBanner,
  isFrenchBrowser,
} from "@app/components/assistant/conversation/FrenchLanguageBanner";
import { UserSettingsPopover } from "@app/components/UserSettingsPopover";
import { useUserLocale } from "@app/hooks/useUserLocale";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { CONVERSATIONAL_BUILDING_SKILL_ID } from "@app/lib/skills/conversational_building";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { TRACKING_AREAS, trackEvent, withTracking } from "@app/lib/tracking";
import { getConversationRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types/user";
import { Button, XClose } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const CONVERSATIONAL_BUILDING_IMAGE_PATH =
  "/static/Conversational_Building_Banner.svg";
const CONVERSATIONAL_BUILDING_BANNER_LOCAL_STORAGE_KEY =
  "conversational-building-banner-dismissed";

interface ConversationalBuildingBannerProps {
  owner: { sId: string };
  showBanner: boolean;
  onShowBanner: (open: boolean) => void;
}

function ConversationalBuildingBanner({
  owner,
  showBanner,
  onShowBanner,
}: ConversationalBuildingBannerProps) {
  const { t } = useLingui();
  const router = useAppRouter();

  // Impression event: denominator for the dismiss / CTA click rates.
  useEffect(() => {
    if (showBanner) {
      trackEvent({
        area: TRACKING_AREAS.CONVERSATION,
        object: "conversational_building_banner",
        action: "view",
      });
    }
  }, [showBanner]);

  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(
      CONVERSATIONAL_BUILDING_BANNER_LOCAL_STORAGE_KEY,
      "true"
    );
    onShowBanner(false);
  };

  // Same entry point as the "Try skill" button of the skill details.
  const onTryIt = () => {
    void router.push(
      getConversationRoute(
        owner.sId,
        "new",
        `skill=${CONVERSATIONAL_BUILDING_SKILL_ID}`
      )
    );
  };

  if (!showBanner) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 100, translateY: "0%" }}
      transition={{ duration: 0.1, ease: "easeIn" }}
      exit={{ opacity: 0, translateY: "120%" }}
      className="relative z-10 mx-2 mb-2 hidden max-w-[300px] flex-col rounded-2xl border border-border-dark bg-background shadow-md sm:flex"
    >
      <div className="relative overflow-hidden rounded-t-2xl">
        <img
          src={CONVERSATIONAL_BUILDING_IMAGE_PATH}
          alt={t`A message asking Dust to improve an agent, next to the modified agent`}
          width={298}
          height={138}
          className="h-auto w-full border-b border-border-dark"
        />
        <Button
          tooltip={t`Dismiss`}
          variant="outline"
          icon={XClose}
          size="icon-xs"
          className="absolute right-1 top-1"
          onClick={withTracking(
            TRACKING_AREAS.CONVERSATION,
            "dismiss_conversational_building_banner",
            onDismiss
          )}
        />
      </div>
      <div className="relative px-4 py-3">
        <div className="mb-3 text-pretty text-sm font-medium text-foreground">
          <Trans>
            You can now build and edit skills and agents directly in
            conversations.
          </Trans>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="highlight"
            size="xs"
            label={t`Try it`}
            onClick={withTracking(
              TRACKING_AREAS.CONVERSATION,
              "try_conversational_building_banner",
              onTryIt
            )}
          />
        </div>
      </div>
    </motion.div>
  );
}

interface StackedInAppBannersProps {
  owner: WorkspaceType;
}

/**
 * @cc [owner:sfriquet,label:product] french-banner-audience
 * `FrenchLanguageBanner` MUST be shown only when the browser's preferred language
 * (`navigator.language`) is French, the `localisation` flag is enabled, the user locale is not
 * `fr-FR`, and `FRENCH_LANGUAGE_BANNER_LOCAL_STORAGE_KEY` is not `"true"`. While it is shown, no
 * other banner MUST be shown.
 */
export function StackedInAppBanners({ owner }: StackedInAppBannersProps) {
  const { hasFeature } = useFeatureFlags();
  const { userLocale } = useUserLocale({ owner });
  const [showFrenchLanguageBanner, setShowFrenchLanguageBanner] = useState(
    () =>
      localStorage.getItem(FRENCH_LANGUAGE_BANNER_LOCAL_STORAGE_KEY) !==
        "true" && isFrenchBrowser()
  );
  const isFrenchLanguageBannerVisible =
    hasFeature("localisation") &&
    userLocale !== "fr-FR" &&
    showFrenchLanguageBanner;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { hasPermission } = useWorkspacePermissions();
  const canBuild =
    hasPermission("create", "agent") || hasPermission("create", "skill");
  const [
    showConversationalBuildingBanner,
    setShowConversationalBuildingBanner,
  ] = useState(
    () =>
      localStorage.getItem(CONVERSATIONAL_BUILDING_BANNER_LOCAL_STORAGE_KEY) !==
      "true"
  );

  return (
    <>
      <UserSettingsPopover
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        owner={owner}
        initialSection="customization"
      />
      <AnimatePresence>
        <FrenchLanguageBanner
          key="french-language-banner"
          owner={owner}
          showBanner={isFrenchLanguageBannerVisible}
          onShowBanner={setShowFrenchLanguageBanner}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        <ConversationalBuildingBanner
          key="conversational-building-banner"
          owner={owner}
          showBanner={
            !isFrenchLanguageBannerVisible &&
            canBuild &&
            showConversationalBuildingBanner
          }
          onShowBanner={setShowConversationalBuildingBanner}
        />
      </AnimatePresence>
    </>
  );
}
