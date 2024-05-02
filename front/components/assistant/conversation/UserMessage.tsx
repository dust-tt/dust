import { PencilSquareIcon } from "@dust-tt/sparkle";
import type {
  ContentFragmentType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { MessageReactionType, UserMessageType } from "@dust-tt/types";
import { useState } from "react";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import type { MessageSizeType } from "@app/components/assistant/conversation/ConversationMessage";
import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { MessageEdit } from "@app/components/assistant/conversation/MessageEdit";
import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";
import { useAgentConfigurations } from "@app/lib/swr";

interface UserMessageProps {
  conversationId: string;
  hideReactions?: boolean;
  isLastMessage: boolean;
  isLastUserMessage: boolean;
  latestMentions: string[];
  message: UserMessageType;
  owner: WorkspaceType;
  reactions: MessageReactionType[];
  user: UserType;
  contentFragments?: ContentFragmentType[];
  size: MessageSizeType;
}

export function UserMessage({
  conversationId,
  hideReactions,
  isLastUserMessage,
  latestMentions,
  message,
  owner,
  reactions,
  user,
  contentFragments,
  size,
}: UserMessageProps) {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: { conversationId },
  });

  const [editing, setEditing] = useState(false);

  const buttons = !isLastUserMessage
    ? []
    : [
        {
          label: "Edit",
          icon: PencilSquareIcon,
          onClick: () => {
            setEditing((editing) => !editing);
          },
        },
      ];

  return (
    <ConversationMessage
      owner={owner}
      user={user}
      conversationId={conversationId}
      messageId={message.sId}
      pictureUrl={message.user?.image || message.context.profilePictureUrl}
      name={message.context.fullName}
      reactions={reactions}
      buttons={buttons}
      enableEmojis={!hideReactions}
      renderName={(name) => <div className="text-base font-medium">{name}</div>}
      type="user"
      citations={contentFragments}
      size={size}
    >
      <div className="flex flex-col gap-4">
        {!editing && (
          <div>
            <RenderMessageMarkdown
              content={message.content}
              isStreaming={false}
              agentConfigurations={agentConfigurations}
            />
          </div>
        )}
        {!editing && message.mentions.length === 0 && isLastUserMessage && (
          <AgentSuggestion
            conversationId={conversationId}
            latestMentions={latestMentions}
            owner={owner}
            userMessage={message}
          />
        )}
        {editing && (
          <MessageEdit
            conversationId={conversationId}
            owner={owner}
            userMessage={message}
            agentConfigurations={agentConfigurations}
            onClose={() => setEditing(false)}
          />
        )}
      </div>
    </ConversationMessage>
  );
}
