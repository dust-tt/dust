import type { UserMessageType, WorkspaceType } from "@dust-tt/types";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import type { ConversationCitationType } from "@app/components/assistant/conversation/messages/ConverationCitationComponent";
import type { MessageSizeType } from "@app/components/assistant/conversation/messages/ConversationMessage";
import { ConversationMessage } from "@app/components/assistant/conversation/messages/ConversationMessage";
import type { MessageEmojiSelectorProps } from "@app/components/assistant/conversation/messages/MessageActions";
import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";

interface UserMessageProps {
  citations?: ConversationCitationType[];
  conversationId: string;
  isLastMessage: boolean;
  message: UserMessageType;
  messageEmoji?: MessageEmojiSelectorProps;
  owner: WorkspaceType;
  size: MessageSizeType;
}

export function UserMessage({
  citations,
  conversationId,
  isLastMessage,
  message,
  messageEmoji,
  owner,
  size,
}: UserMessageProps) {
  return (
    <ConversationMessage
      pictureUrl={message.user?.image || message.context.profilePictureUrl}
      name={message.context.fullName}
      messageEmoji={messageEmoji}
      renderName={(name) => <div className="text-base font-medium">{name}</div>}
      type="user"
      citations={citations}
      size={size}
    >
      <div className="flex flex-col gap-4">
        <div>
          <RenderMessageMarkdown
            content={message.content}
            isStreaming={false}
            isLastMessage={isLastMessage}
          />
        </div>
        {message.mentions.length === 0 && isLastMessage && (
          <AgentSuggestion
            conversationId={conversationId}
            owner={owner}
            userMessage={message}
          />
        )}
      </div>
    </ConversationMessage>
  );
}
