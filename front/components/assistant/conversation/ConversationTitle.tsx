import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { EditConversationTitleDialog } from "@app/components/assistant/conversation/EditConversationTitleDialog";
import { PlanPanelButton } from "@app/components/assistant/conversation/plan_mode/PlanPanelButton";
import { getParentConversationTitleLabel } from "@app/components/assistant/conversation/utils";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversation } from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useActivationPod } from "@app/lib/swr/activation";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  getConversationRoute,
  getGetStartedRoute,
  getPodRoute,
} from "@app/lib/utils/router";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import {
  CREDITS_SIDE_PANEL_TYPE,
  FILES_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import type { WorkspaceType } from "@app/types/user";
import type { BreadcrumbsItem } from "@dust-tt/sparkle";
import {
  ArrowLeft,
  Breadcrumbs,
  Button,
  Chip,
  CoinsStacked01,
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
  const { currentPanel, togglePanel } = useConversationSidePanelContext();
  const { conversation } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });
  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: conversation?.spaceId ?? null,
  });
  const { activationPodId } = useActivationPod({
    workspaceId: owner.sId,
  });
  const isMobile = useIsMobile();

  const [showRenameDialog, setShowRenameDialog] = useState(false);

  const {
    isMenuOpen,
    isMenuOpenOrClosing,
    menuTriggerPosition,
    handleRightClick,
    handleRightPointerDown,
    handleMenuPhaseChange,
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
    const isActivationPod = spaceId === activationPodId;
    breadcrumbItems.push({
      icon: isMobile ? undefined : ArrowLeft,
      label: isActivationPod ? "For you" : spaceInfo.name,
      href: isActivationPod
        ? getGetStartedRoute(owner.sId)
        : getPodRoute(owner.sId, spaceId),
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
        className="grid h-full min-w-0 max-w-full grid-cols-[1fr_auto] items-center gap-3"
        onPointerDownCapture={handleRightPointerDown}
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
          {/* Side panel toggles read as filter chips: primary while their panel is open. */}
          <Button
            size="xs"
            label={isMobile ? undefined : "Credit usage"}
            icon={CoinsStacked01}
            variant={
              currentPanel === CREDITS_SIDE_PANEL_TYPE ? "primary" : "ghost"
            }
            onClick={() => togglePanel({ type: CREDITS_SIDE_PANEL_TYPE })}
          />
          <Button
            size="xs"
            label={isMobile ? undefined : "Files"}
            icon={Folder}
            variant={
              currentPanel === FILES_SIDE_PANEL_TYPE ? "primary" : "ghost"
            }
            onClick={() => togglePanel({ type: FILES_SIDE_PANEL_TYPE })}
          />
          <PlanPanelButton
            key={activeConversationId}
            conversationId={activeConversationId}
            workspaceId={owner.sId}
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
            isOpenOrClosing={isMenuOpenOrClosing}
            onPhaseChange={handleMenuPhaseChange}
            triggerPosition={menuTriggerPosition}
          />
        </div>
      </div>
    </AppLayoutTitle>
  );
}
