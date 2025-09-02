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
import {
  COPILOT_SEED_PROMPT,
  COPILOT_STATE_WRAP_START,
  COPILOT_STATE_WRAP_END,
} from "@app/lib/assistant/copilot";

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
            // Hide the Copilot seed prompt and the hidden editor state block from display.
            let contentForDisplay = message.content;

            // 1) Strip the seed prompt (first message only)
            if (contentForDisplay.startsWith(COPILOT_SEED_PROMPT)) {
              contentForDisplay = contentForDisplay
                .slice(COPILOT_SEED_PROMPT.length)
                .trimStart();
            }

            // 2) Strip a leading editor state block wrapped in markers.
            //    Allow for optional leading whitespace before the start marker.
            const stripEditorStateBlock = (text: string) => {
              const leadingWs = text.match(/^\s*/)?.[0].length ?? 0;
              const afterWs = text.slice(leadingWs);
              if (afterWs.startsWith(COPILOT_STATE_WRAP_START)) {
                const endIdx = afterWs.indexOf(COPILOT_STATE_WRAP_END);
                if (endIdx !== -1) {
                  const sliceAfter = endIdx + COPILOT_STATE_WRAP_END.length;
                  return afterWs.slice(sliceAfter).trimStart();
                }
              }
              return text;
            };

            contentForDisplay = stripEditorStateBlock(contentForDisplay);
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
