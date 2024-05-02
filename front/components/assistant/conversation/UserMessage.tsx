import type {
  ContentFragmentType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { MessageReactionType, UserMessageType } from "@dust-tt/types";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import type { MessageSizeType } from "@app/components/assistant/conversation/ConversationMessage";
import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";
import { useAgentConfigurations } from "@app/lib/swr";
import {ArrowPathIcon, ClipboardIcon} from "@dust-tt/sparkle";
import {EditIcon} from "lucide-react";
import {useState} from "react";
import {MessageEdit} from "@app/components/assistant/conversation/MessageEdit";

interface UserMessageProps {
  conversationId: string;
  hideReactions?: boolean;
  isLastMessage: boolean;
  isLastUserMessage: boolean,
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
  isLastMessage,
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
  
  const [editing, setEditing] = useState(false)
  
  const buttons = !isLastUserMessage
    ? []
    : [
      {
        label: "Edit",
        icon: EditIcon,
        onClick: () => {
          setEditing(editing => !editing)
        },
      }
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
        {!editing && message.mentions.length === 0 && isLastMessage && (
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
          />
        )}
      </div>
    </ConversationMessage>
  );
}
