import type { ContentFragmentType, WorkspaceType } from "@dust-tt/types";
import type { UserMessageType } from "@dust-tt/types";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import type { MessageSizeType } from "@app/components/assistant/conversation/messages/ConversationMessage";
import { ConversationMessage } from "@app/components/assistant/conversation/messages/ConversationMessage";
import type { MessageEmojiSelectorProps } from "@app/components/assistant/conversation/messages/MessageActions";
import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";

interface UserMessageProps {
  contentFragments?: ContentFragmentType[];
  conversationId: string;
  isLastMessage: boolean;
  message: UserMessageType;
  messageEmoji?: MessageEmojiSelectorProps;
  owner: WorkspaceType;
  size: MessageSizeType;
}

export function UserMessage({
  contentFragments,
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
      citations={contentFragments}
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
