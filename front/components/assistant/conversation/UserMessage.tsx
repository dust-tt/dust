import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";
import { useAgentConfigurations } from "@app/lib/swr";
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
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
  });

  return (
    <ConversationMessage
      pictureUrl={message.context.profilePictureUrl}
      name={message.context.fullName}
      messageId={message.sId}
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
