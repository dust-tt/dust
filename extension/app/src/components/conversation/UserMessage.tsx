/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  ConversationMessageEmojiSelectorProps,
  ConversationMessageSizeType,
} from "@dust-tt/sparkle";
import { ConversationMessage } from "@dust-tt/sparkle";
import type { LightWorkspaceType, UserMessageType } from "@dust-tt/types";

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversationId: string;
  isLastMessage: boolean;
  message: UserMessageType;
  messageEmoji?: ConversationMessageEmojiSelectorProps;
  owner: LightWorkspaceType;
  size: ConversationMessageSizeType;
}

export function UserMessage({
  citations,
  isLastMessage,
  message,
  messageEmoji,
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
        <div>{message.content}</div>
        {/* {message.mentions.length === 0 && isLastMessage && (
          TODO: Handle agent suggestions
          <AgentSuggestion
            conversationId={conversationId}
            owner={owner}
            userMessage={message}
          />
        )} */}
      </div>
    </ConversationMessage>
  );
}
