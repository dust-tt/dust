import type { ConversationMessageSizeType } from "@dust-tt/sparkle";
import { ConversationMessage, Markdown } from "@dust-tt/sparkle";
import type { UserMessageType, WorkspaceType } from "@dust-tt/types";
import { useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  MentionBlock,
  mentionDirective,
} from "@app/components/markdown/MentionBlock";

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversationId: string;
  isLastMessage: boolean;
  message: UserMessageType;
  owner: WorkspaceType;
  size: ConversationMessageSizeType;
}

export function UserMessage({
  citations,
  conversationId,
  isLastMessage,
  message,
  owner,
  size,
}: UserMessageProps) {
  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      mention: MentionBlock,
    }),
    []
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [getCiteDirective(), mentionDirective],
    []
  );

  return (
    <>
      <ConversationMessage
        pictureUrl={message.user?.image || message.context.profilePictureUrl}
        name={message.context.fullName}
        renderName={(name) => (
          <div className="text-base font-medium">{name}</div>
        )}
        type="user"
        citations={citations}
        size={size}
      >
        <div className="flex flex-col gap-4">
          <div>
            <Markdown
              content={message.content}
              isStreaming={false}
              isLastMessage={isLastMessage}
              additionalMarkdownComponents={additionalMarkdownComponents}
              additionalMarkdownPlugins={additionalMarkdownPlugins}
            />
          </div>
        </div>
      </ConversationMessage>
      {message.mentions.length === 0 && isLastMessage && (
        <AgentSuggestion
          conversationId={conversationId}
          owner={owner}
          userMessage={message}
        />
      )}
    </>
  );
}
