import { HeartAltIcon, Icon } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import { useEffect, useState } from "react";

import { HelpDrawer } from "@app/components/assistant/HelpDrawer";
import { QuickStartGuide } from "@app/components/quick_start_guide";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useUserMetadata } from "@app/lib/swr";
import { setUserMetadataFromClient } from "@app/lib/user";

interface HelpAndQuickGuideWrapperProps {
  owner: WorkspaceType;
  user: UserType;
}

export function HelpAndQuickGuideWrapper({
  owner,
  user,
}: HelpAndQuickGuideWrapperProps) {
  const [isHelpDrawerOpen, setIsHelpDrawerOpen] = useState<boolean>(false);
  const [showQuickGuide, setShowQuickGuide] = useState<boolean>(false);

  const {
    metadata: quickGuideSeen,
    isMetadataError: isQuickGuideSeenError,
    isMetadataLoading: isQuickGuideSeenLoading,
    mutateMetadata: mutateQuickGuideSeen,
  } = useUserMetadata("quick_guide_seen");

  const { submit: handleCloseQuickGuide } = useSubmitFunction(async () => {
    setUserMetadataFromClient({ key: "quick_guide_seen", value: "true" })
      .then(() => {
        return mutateQuickGuideSeen();
      })
      .catch(console.error);
    setShowQuickGuide(false);
  });

  useEffect(() => {
    if (!quickGuideSeen && !isQuickGuideSeenError && !isQuickGuideSeenLoading) {
      // Quick guide has never been shown, lets show it.
      setShowQuickGuide(true);
    }
  }, [isQuickGuideSeenError, isQuickGuideSeenLoading, quickGuideSeen]);

  return (
    <>
      <HelpDrawer
        owner={owner}
        user={user}
        show={isHelpDrawerOpen}
        onClose={() => setIsHelpDrawerOpen(false)}
      />
      <QuickStartGuide
        owner={owner}
        user={user}
        show={showQuickGuide}
        onClose={() => {
          void handleCloseQuickGuide();
        }}
      />

      {/* Quick start guide CTA */}
      <div
        id="quick-start-guide-button"
        className="fixed right-6 top-2 z-50 transition-transform duration-300 ease-in-out hover:scale-110 lg:bottom-4 lg:right-4 lg:top-auto"
      >
        <div
          className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-emerald-500 bg-emerald-400 shadow-lg transition-colors duration-300 ease-in-out hover:border-emerald-400 hover:bg-emerald-300"
          onClick={() => setIsHelpDrawerOpen(true)}
        >
          <Icon visual={HeartAltIcon} className="text-white" size="md" />
        </div>
      </div>
    </>
  );
}
