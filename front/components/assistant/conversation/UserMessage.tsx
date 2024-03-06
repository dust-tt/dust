import type { UserType, WorkspaceType } from "@dust-tt/types";
import type {
  ConversationType,
  MessageReactionType,
  UserMessageType,
} from "@dust-tt/types";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";
import { useAgentConfigurations } from "@app/lib/swr";

export function UserMessage({
  message,
  conversation,
  owner,
  user,
  reactions,
}: {
  message: UserMessageType;
  conversation: ConversationType;
  owner: WorkspaceType;
  user: UserType;
  reactions: MessageReactionType[];
}) {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: { conversationId: conversation.sId },
  });

  return (
    <ConversationMessage
      owner={owner}
      user={user}
      conversationId={conversation.sId}
      messageId={message.sId}
      pictureUrl={message.user?.image || message.context.profilePictureUrl}
      name={message.context.fullName}
      reactions={reactions}
      enableEmojis={true}
      renderName={(name) => <div className="text-base font-medium">{name}</div>}
    >
      <div className="flex flex-col gap-4">
        <div>
          <RenderMessageMarkdown
            content={message.content}
            blinkingCursor={false}
            agentConfigurations={agentConfigurations}
          />
        </div>
        {message.mentions.length === 0 &&
          conversation.content[conversation.content.length - 1].some(
            (m) => m.sId === message.sId
          ) && (
            <AgentSuggestion
              userMessage={message}
              conversation={conversation}
              owner={owner}
            />
          )}
      </div>
    </ConversationMessage>
  );
}
