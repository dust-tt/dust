import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversation } from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { getConversationRoute, getProjectRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types/user";
import type { BreadcrumbItem } from "@dust-tt/sparkle";
import {
  ActionGitBranchIcon,
  ArrowLeftIcon,
  AttachmentIcon,
  Breadcrumbs,
  Button,
  Chip,
  MoreIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { EditConversationTitleDialog } from "./EditConversationTitleDialog";

const UNTITLED_CONVERSATION_TITLE = "Untitled conversation";

export function ConversationTitle({ owner }: { owner: WorkspaceType }) {
  const activeConversationId = useActiveConversationId();
  const { user } = useAuth();
  const { openPanel } = useConversationSidePanelContext();
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
  const forkedFrom = conversation?.forkedFrom;

  const breadcrumbItems: BreadcrumbItem[] = [];

  if (spaceId && spaceInfo) {
    breadcrumbItems.push({
      icon: isMobile ? undefined : ArrowLeftIcon,
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

  const hasReadableParentConversation =
    !!forkedFrom && "parentConversationTitle" in forkedFrom;
  const parentConversationTitle = hasReadableParentConversation
    ? (forkedFrom.parentConversationTitle ?? UNTITLED_CONVERSATION_TITLE)
    : "Parent conversation";
  const forkedFromTooltipLabel = hasReadableParentConversation
    ? `Branched from ${parentConversationTitle}`
    : "Branched from a parent conversation you can no longer access";

  return (
    <AppLayoutTitle>
      <div
        className="grid h-full min-w-0 max-w-full grid-cols-[1fr,auto] items-center gap-3"
        onContextMenu={handleRightClick}
      >
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-hide">
          <div className="min-w-0">
            <Breadcrumbs
              items={breadcrumbItems}
              className="dd-privacy-mask"
              truncateLengthMiddle={35}
              truncateLengthEnd={120}
            />
          </div>
          {forkedFrom && (
            <Tooltip
              label={forkedFromTooltipLabel}
              tooltipTriggerAsChild
              trigger={
                hasReadableParentConversation ? (
                  <Chip
                    className="max-w-44 shrink-0 dd-privacy-mask"
                    color="primary"
                    href={getConversationRoute(
                      owner.sId,
                      forkedFrom.parentConversationId
                    )}
                    icon={ActionGitBranchIcon}
                    label={parentConversationTitle}
                    size="mini"
                  />
                ) : (
                  <Chip
                    className="max-w-44 shrink-0"
                    color="primary"
                    icon={ActionGitBranchIcon}
                    label={parentConversationTitle}
                    size="mini"
                  />
                )
              }
            />
          )}
        </div>
        <EditConversationTitleDialog
          isOpen={showRenameDialog}
          onClose={() => setShowRenameDialog(false)}
          owner={owner}
          conversationId={activeConversationId}
          currentTitle={currentTitle}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            label={isMobile ? undefined : "Files"}
            icon={AttachmentIcon}
            variant="ghost"
            onClick={() => openPanel({ type: "files" })}
          />
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
