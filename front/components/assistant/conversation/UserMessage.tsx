import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";
import { useAgentConfigurations } from "@app/lib/swr";
import {
  ConversationType,
  MessageReactionType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { UserType, WorkspaceType } from "@app/types/user";

import { AgentSuggestion } from "./AgentSuggestion";

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
  });

  return (
    <ConversationMessage
      owner={owner}
      user={user}
      conversationId={conversation.sId}
      messageId={message.sId}
      pictureUrl={message.context.profilePictureUrl}
      name={message.context.fullName}
      reactions={reactions}
      enableEmojis={true}
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
