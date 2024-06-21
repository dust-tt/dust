import { Button, HeartAltIcon } from "@dust-tt/sparkle";
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
        className="fixed right-6 top-2 z-50 lg:bottom-6 lg:right-6 lg:top-auto"
      >
        <Button
          icon={HeartAltIcon}
          labelVisible={false}
          label="Quick Start Guide"
          onClick={() => setIsHelpDrawerOpen(true)}
          size="md"
          variant="primary"
          hasMagnifying={true}
          disabledTooltip={true}
          className="!border-emerald-600 !bg-brand"
        />
      </div>
    </>
  );
}
