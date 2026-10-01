import { useAppRouter } from "@app/lib/platform";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { TRACKING_AREAS, trackEvent, withTracking } from "@app/lib/tracking";
import { getConversationRoute } from "@app/lib/utils/router";
import { Button, XClose } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const CONVERSATIONAL_BUILDING_IMAGE_PATH =
  "/static/Conversational_Building_Banner.svg";
const CONVERSATIONAL_BUILDING_BANNER_LOCAL_STORAGE_KEY =
  "conversational-building-banner-dismissed";

// sId of the code-defined `conversationalBuildingSkill` (server-side, not importable here).
const CONVERSATIONAL_BUILDING_SKILL_ID = "conversational-building";

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
  owner: { sId: string };
}

export function StackedInAppBanners({ owner }: StackedInAppBannersProps) {
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
    <AnimatePresence>
      <ConversationalBuildingBanner
        key="conversational-building-banner"
        owner={owner}
        showBanner={canBuild && showConversationalBuildingBanner}
        onShowBanner={setShowConversationalBuildingBanner}
      />
    </AnimatePresence>
  );
}
