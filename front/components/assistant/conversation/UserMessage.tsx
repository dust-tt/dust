import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { RenderMarkdown } from "@app/components/RenderMarkdown";
import {
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { WorkspaceType } from "@app/types/user";

import { AgentSuggestion } from "./AgentSuggestion";

export function UserMessage({
  message,
  conversation,
  owner,
}: {
  message: UserMessageType;
  conversation: ConversationType;
  owner: WorkspaceType;
}) {
  return (
    <ConversationMessage
      pictureUrl={message.context.profilePictureUrl}
      name={message.context.fullName}
      messageId={message.sId}
    >
      <div className="flex flex-col gap-4">
        <div>
          <RenderMarkdown content={message.content} blinkingCursor={false} />
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
