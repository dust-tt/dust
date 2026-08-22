import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FilePreviewProvider } from "@app/components/assistant/conversation/FilePreviewContext";
import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { useConversation } from "@app/hooks/conversations";
import type { SubscriptionType } from "@app/types/plan";
import type { UserType, WorkspaceType } from "@app/types/user";

interface AppConversationPaneProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
  conversationId: string;
}

/**
 * The App's conversation.
 *
 * Conversation routes get these providers from `ConversationLayout` (and `BlockedActionsProvider`
 * from `AssistantLayout`). The App builder renders outside both — it has no sidebar, title bar or
 * side panel — so it mounts the providers the conversation subtree actually consumes, in the same
 * order, and nothing else. `AgentBuilderSidekick` does the same for its embedded conversation.
 *
 * All five are load-bearing: `ConversationViewer` and `InputBar` read the generation context,
 * `AgentMessage` the blocked actions, `AgentMessageGeneratedFiles` the side panel, citations the
 * file preview, and `DropzoneContainer` the file drop.
 */
export function AppConversationPane({
  owner,
  subscription,
  user,
  conversationId,
}: AppConversationPaneProps) {
  const { conversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
  });

  return (
    <BlockedActionsProvider owner={owner} conversation={conversation}>
      <FilePreviewProvider owner={owner}>
        <ConversationSidePanelProvider>
          <FileDropProvider>
            <GenerationContextProvider>
              <ConversationContainerVirtuoso
                owner={owner}
                subscription={subscription}
                user={user}
                conversationId={conversationId}
              />
            </GenerationContextProvider>
          </FileDropProvider>
        </ConversationSidePanelProvider>
      </FilePreviewProvider>
    </BlockedActionsProvider>
  );
}
