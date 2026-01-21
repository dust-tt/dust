import { ArrowLeftIcon, Button, IconButton, MoreIcon } from "@dust-tt/sparkle";
import { useState } from "react";

import { ConversationFilesPopover } from "@app/components/assistant/conversation/ConversationFilesPopover";
import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useAppRouter } from "@app/lib/platform";
import { useConversation } from "@app/lib/swr/conversations";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useUser } from "@app/lib/swr/user";
import { getSpaceConversationsRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";

import { EditConversationTitleDialog } from "./EditConversationTitleDialog";

export function ConversationTitle({ owner }: { owner: WorkspaceType }) {
  const activeConversationId = useActiveConversationId();
  const { user } = useUser();
  const { conversation } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });
  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: conversation?.spaceId ?? null,
  });
  const router = useAppRouter();

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

  return (
    <AppLayoutTitle>
      <div
        className="grid h-full min-w-0 max-w-full grid-cols-[auto,1fr,auto] items-center gap-3"
        onContextMenu={handleRightClick}
      >
        <div className="flex min-w-0">
          {conversation?.spaceId && (
            <IconButton
              size="xmini"
              variant="outline"
              icon={ArrowLeftIcon}
              aria-label={`Back to ${spaceInfo?.name}`}
              onClick={() => {
                void router.push(
                  getSpaceConversationsRoute(owner.sId, conversation.spaceId!),
                  undefined,
                  {
                    shallow: true,
                  }
                );
              }}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-row items-center gap-1 text-primary dark:text-primary-night">
          {!!spaceInfo && (
            <div className="dd-privacy-mask min-w-0 overflow-hidden truncate text-base font-normal text-muted-foreground">
              {spaceInfo.name} -
            </div>
          )}
          <div
            className="dd-privacy-mask min-w-0 cursor-pointer overflow-hidden truncate text-base font-normal text-muted-foreground hover:underline"
            onClick={() => setShowRenameDialog(true)}
          >
            {currentTitle}
          </div>
          <EditConversationTitleDialog
            isOpen={showRenameDialog}
            onClose={() => setShowRenameDialog(false)}
            owner={owner}
            conversationId={activeConversationId}
            currentTitle={currentTitle}
          />
        </div>
        <div className="flex items-center gap-2">
          <ConversationFilesPopover
            conversationId={activeConversationId}
            owner={owner}
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
