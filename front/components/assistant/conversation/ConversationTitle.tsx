import { ConversationFilesPopover } from "@app/components/assistant/conversation/ConversationFilesPopover";
import { ConversationMenu } from "@app/components/assistant/conversation/ConversationMenu";
import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversation } from "@app/lib/swr/conversations";
import type { WorkspaceType } from "@app/types";

export function ConversationTitle({
  owner,
  baseUrl,
}: {
  owner: WorkspaceType;
  baseUrl: string;
}) {
  const { activeConversationId } = useConversationsNavigation();

  const { conversation } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

  if (!activeConversationId) {
    return null;
  }

  return (
    <AppLayoutTitle>
      <div className="grid h-full min-w-0 max-w-full grid-cols-[1fr,auto] items-center gap-4">
        <div className="flex min-w-0 flex-row items-center gap-4 text-primary dark:text-primary-night">
          <div className="dd-privacy-mask min-w-0 overflow-hidden truncate text-sm font-normal">
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
            baseUrl={baseUrl}
            owner={owner}
          />
        </div>
      </div>
    </AppLayoutTitle>
  );
}
