import type { UserType, WorkspaceType } from "@dust-tt/types";
import { useEffect, useState } from "react";

import { HelpDrawer } from "@app/components/assistant/HelpDrawer";
import { QuickStartGuide } from "@app/components/quick_start_guide";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useUserMetadata } from "@app/lib/swr/user";
import { ClientSideTracking } from "@app/lib/tracking/client";
import { setUserMetadataFromClient } from "@app/lib/user";
import { classNames } from "@app/lib/utils";

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

  useEffect(() => {
    if (isHelpDrawerOpen) {
      void ClientSideTracking.trackHelpDrawerOpened({
        email: user.email,
        workspaceId: owner.sId,
      });
    }
  }, [isHelpDrawerOpen, user.email, owner.sId]);

  return (
    <>
      <HelpDrawer
        owner={owner}
        user={user}
        show={isHelpDrawerOpen}
        onClose={() => setIsHelpDrawerOpen(false)}
        setShowQuickGuide={setShowQuickGuide}
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
        className="fixed bottom-0 right-0 xl:bottom-4 xl:right-4 xl:z-50"
      >
        <div
          className={classNames(
            "flex cursor-pointer items-center justify-center shadow-lg",
            "h-12 w-12 xl:h-14 xl:w-14",
            "rounded-tl-2xl xl:rounded-full",
            "transition-colors transition-transform duration-300 ease-in-out",
            "border border-emerald-500 bg-emerald-400",
            "hover:scale-110 hover:border-emerald-400 hover:bg-emerald-300"
          )}
          onClick={() => setIsHelpDrawerOpen(true)}
        >
          <span
            style={{ fontSize: "28px", color: "white", fontWeight: "bold" }}
          >
            ?
          </span>
        </div>
      </div>
    </>
  );
}
