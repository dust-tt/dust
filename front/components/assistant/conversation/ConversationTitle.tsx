import { Button, MoreIcon } from "@dust-tt/sparkle";

import { ConversationFilesPopover } from "@app/components/assistant/conversation/ConversationFilesPopover";
import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversation } from "@app/lib/swr/conversations";
import { useUser } from "@app/lib/swr/user";
import type { WorkspaceType } from "@app/types";

export function ConversationTitle({ owner }: { owner: WorkspaceType }) {
  const { activeConversationId } = useConversationsNavigation();
  const { user } = useUser();
  const { conversation } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

  const {
    isMenuOpen,
    menuTriggerPosition,
    handleRightClick,
    handleMenuOpenChange,
  } = useConversationMenu();

  if (!activeConversationId) {
    return null;
  }

  return (
    <AppLayoutTitle>
      <div
        className="grid h-full min-w-0 max-w-full grid-cols-[1fr,auto] items-center gap-4"
        onContextMenu={handleRightClick}
      >
        <div className="flex min-w-0 flex-row items-center gap-4 text-primary dark:text-primary-night">
          <div className="dd-privacy-mask min-w-0 cursor-pointer select-none overflow-hidden truncate text-sm font-normal">
            {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
            {conversation?.title || ""}
          </div>
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
