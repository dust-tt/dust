import type {
  ConversationMessageEmojiSelectorProps,
  ConversationMessageSizeType,
} from "@dust-tt/sparkle";
import { ConversationMessage } from "@dust-tt/sparkle";
import type { UserMessageType, WorkspaceType } from "@dust-tt/types";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import { RenderMessageMarkdown } from "@app/components/assistant/markdown/RenderMessageMarkdown";

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversationId: string;
  isLastMessage: boolean;
  message: UserMessageType;
  messageEmoji?: ConversationMessageEmojiSelectorProps;
  owner: WorkspaceType;
  size: ConversationMessageSizeType;
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
