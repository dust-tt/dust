import { ConversationMessage, Markdown } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  ContentNodeMentionBlock,
  contentNodeMentionDirective,
} from "@app/components/markdown/ContentNodeMentionBlock";
import {
  getMentionPlugin,
  mentionDirective,
} from "@app/components/markdown/MentionBlock";
import type { UserMessageType, WorkspaceType } from "@app/types";
import { COPILOT_SEED_PROMPT } from "@app/lib/assistant/copilot";

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversationId: string;
  isLastMessage: boolean;
  message: UserMessageType;
  owner: WorkspaceType;
}

export function UserMessage({
  citations,
  conversationId,
  isLastMessage,
  message,
  owner,
}: UserMessageProps) {
  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      mention: getMentionPlugin(owner),
      content_node_mention: ContentNodeMentionBlock,
    }),
    [owner]
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [getCiteDirective(), mentionDirective, contentNodeMentionDirective],
    []
  );

  return (
    <div className="flex flex-grow flex-col">
      <div className="min-w-60 max-w-full self-end">
        <ConversationMessage
          pictureUrl={message.context.profilePictureUrl || message.user?.image}
          name={message.context.fullName ?? undefined}
          renderName={(name) => <div className="heading-base">{name}</div>}
          type="user"
          citations={citations}
        >
          {(() => {
            // Hide the Copilot seed prompt from the visible user message.
            const contentForDisplay = message.content.startsWith(
              COPILOT_SEED_PROMPT
            )
              ? message.content
                  .slice(COPILOT_SEED_PROMPT.length)
                  .trimStart()
              : message.content;
            return (
              <Markdown
                content={contentForDisplay}
                isStreaming={false}
                isLastMessage={isLastMessage}
                additionalMarkdownComponents={additionalMarkdownComponents}
                additionalMarkdownPlugins={additionalMarkdownPlugins}
              />
            );
          })()}
        </ConversationMessage>
      </div>
      {message.mentions.length === 0 && isLastMessage && (
        <AgentSuggestion
          conversationId={conversationId}
          owner={owner}
          userMessage={message}
        />
      )}
    </div>
  );
}
