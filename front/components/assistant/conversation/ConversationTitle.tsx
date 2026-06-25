import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { EditConversationTitleDialog } from "@app/components/assistant/conversation/EditConversationTitleDialog";
import { getParentConversationTitleLabel } from "@app/components/assistant/conversation/utils";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversation } from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { getConversationRoute, getPodRoute } from "@app/lib/utils/router";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import {
  ArrowLeft,
  Breadcrumbs,
  type BreadcrumbsItem,
  Button,
  Chip,
  DotsHorizontal,
  Folder,
  GitBranch01,
  Tooltip,
} from "@dust-tt/sparkle";
import { useState } from "react";

const BREADCRUMB_MIDDLE_TRUNCATE_LENGTH = 35;
const DESKTOP_TITLE_TRUNCATE_LENGTH = 120;
const MOBILE_FORKED_TITLE_TRUNCATE_LENGTH = 35;

export function ConversationTitle({ owner }: { owner: WorkspaceType }) {
  const activeConversationId = useActiveConversationId();
  const { user } = useAuth();
  const { togglePanel } = useConversationSidePanelContext();
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

  const currentTitle = conversation
    ? getConversationDisplayTitle(conversation)
    : "";

  if (!activeConversationId) {
    return null;
  }

  const spaceId = conversation?.spaceId;
  const isProjectConversation = !!spaceId;
  const isLoading = isProjectConversation && !spaceInfo;
  const forkedFrom = conversation?.forkingData?.forkedFrom;
  const isMobileForkedConversation = isMobile && !!forkedFrom;

  const breadcrumbItems: BreadcrumbsItem[] = [];

  if (spaceId && spaceInfo) {
    breadcrumbItems.push({
      icon: isMobile ? undefined : ArrowLeft,
      label: spaceInfo.name,
      onClick: () => {
        void router.push(getPodRoute(owner.sId, spaceId), undefined, {
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

  const ForkedFromChip = () => {
    if (!forkedFrom) {
      return null;
    }

    const chipLabel = getParentConversationTitleLabel(forkedFrom);
    const tooltipLabel = `Branched from '${chipLabel}'`;

    return (
      <div className="flex h-9 shrink-0 items-center">
        <Tooltip
          label={tooltipLabel}
          tooltipTriggerAsChild
          trigger={
            <span className="inline-flex h-9 items-center">
              <Chip
                className={
                  isMobile
                    ? "shrink-0 dd-privacy-mask [&>span]:sr-only"
                    : "max-w-44 shrink-0 dd-privacy-mask"
                }
                color="primary"
                href={getConversationRoute(
                  owner.sId,
                  forkedFrom.parentConversationId
                )}
                icon={GitBranch01}
                label={isMobile ? tooltipLabel : chipLabel}
                size="mini"
              />
            </span>
          }
        />
      </div>
    );
  };

  return (
    <AppLayoutTitle>
      <div
        className="grid h-full min-w-0 max-w-full grid-cols-[1fr,auto] items-center gap-3"
        onContextMenu={handleRightClick}
      >
        <div
          className={
            isMobileForkedConversation
              ? "flex min-w-0 items-center gap-2 overflow-hidden scrollbar-hide"
              : "flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-hide"
          }
        >
          <div
            className={
              isMobileForkedConversation
                ? "flex min-w-0 flex-1 items-center overflow-hidden"
                : "flex min-w-0 items-center"
            }
          >
            <Breadcrumbs
              items={breadcrumbItems}
              className="dd-privacy-mask"
              truncateLengthMiddle={BREADCRUMB_MIDDLE_TRUNCATE_LENGTH}
              truncateLengthEnd={
                isMobileForkedConversation
                  ? MOBILE_FORKED_TITLE_TRUNCATE_LENGTH
                  : DESKTOP_TITLE_TRUNCATE_LENGTH
              }
            />
          </div>
          <ForkedFromChip />
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
            icon={Folder}
            variant="ghost"
            onClick={() => togglePanel({ type: "files" })}
          />
          <ConversationMenu
            activeConversationId={activeConversationId}
            conversation={conversation}
            owner={owner}
            trigger={({ isPendingAction }) => (
              <Button
                size="sm"
                variant="ghost"
                icon={DotsHorizontal}
                aria-label="Conversation menu"
                isLoading={isPendingAction}
                disabled={
                  activeConversationId === null ||
                  conversation === null ||
                  user === null ||
                  isPendingAction
                }
              />
            )}
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
