import { ConversationAttachmentsPopover } from "@app/components/assistant/conversation/ConversationAttachmentsPopover";
import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversation } from "@app/hooks/conversations";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { getProjectRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types/user";
import type { BreadcrumbItem } from "@dust-tt/sparkle";
import {
  ArrowLeftIcon,
  Breadcrumbs,
  Button,
  FolderOpenIcon,
  MoreIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { EditConversationTitleDialog } from "./EditConversationTitleDialog";

export function ConversationTitle({ owner }: { owner: WorkspaceType }) {
  const activeConversationId = useActiveConversationId();
  const { user } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const { openPanel } = useConversationSidePanelContext();
  const useSidePanelFiles = hasFeature("sidepanel_files");
  const { attachments } = useConversationAttachments({
    conversationId: activeConversationId,
    owner,
    options: { disabled: !useSidePanelFiles },
  });
  const { conversation } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });
  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: conversation?.spaceId ?? null,
  });
  const router = useAppRouter();
  const isMobile = useIsMobile();

  const [showRenameDialog, setShowRenameDialog] = useState(false);

  const {
    isMenuOpen,
    menuTriggerPosition,
    handleRightClick,
    handleMenuOpenChange,
  } = useConversationMenu();

  const currentTitle = conversation?.title ?? "";

  if (!activeConversationId) {
    return null;
  }

  const spaceId = conversation?.spaceId;
  const isProjectConversation = !!spaceId;
  const isLoading = isProjectConversation && !spaceInfo;

  const breadcrumbItems: BreadcrumbItem[] = [];

  if (spaceId && spaceInfo) {
    breadcrumbItems.push({
      icon: ArrowLeftIcon,
      label: spaceInfo.name,
      onClick: () => {
        void router.push(getProjectRoute(owner.sId, spaceId), undefined, {
          shallow: true,
        });
      },
    });
  }

  if (!isLoading) {
    breadcrumbItems.push({
      label: currentTitle || "New Conversation",
      onClick: () => setShowRenameDialog(true),
    });
  }

  return (
    <AppLayoutTitle>
      <div
        className="grid h-full min-w-0 max-w-full grid-cols-[1fr,auto] items-center gap-3"
        onContextMenu={handleRightClick}
      >
        <Breadcrumbs
          items={breadcrumbItems}
          className="dd-privacy-mask"
          truncateLengthMiddle={isMobile ? undefined : 35}
          truncateLengthEnd={isMobile ? undefined : 120}
        />
        <EditConversationTitleDialog
          isOpen={showRenameDialog}
          onClose={() => setShowRenameDialog(false)}
          owner={owner}
          conversationId={activeConversationId}
          currentTitle={currentTitle}
        />
        <div className="flex items-center gap-2">
          <ConversationAttachmentsPopover
            conversation={conversation}
            owner={owner}
          />
          {useSidePanelFiles && (
            <Button
              size="sm"
              label="Files"
              isCounter={attachments.length > 0}
              counterValue={String(attachments.length)}
              icon={FolderOpenIcon}
              variant="ghost"
              onClick={() => openPanel({ type: "files" })}
            />
          )}
          <ConversationMenu
            activeConversationId={activeConversationId}
            conversation={conversation}
            owner={owner}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                icon={MoreIcon}
                aria-label="Conversation menu"
                disabled={
                  activeConversationId === null ||
                  conversation === null ||
                  user === null
                }
              />
            }
            isConversationDisplayed={true}
            isOpen={isMenuOpen}
            onOpenChange={handleMenuOpenChange}
            triggerPosition={menuTriggerPosition}
          />
        </div>
      </div>
    </AppLayoutTitle>
  );
}
