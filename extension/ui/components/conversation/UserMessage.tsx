import type { LightWorkspaceType, UserMessageType } from "@dust-tt/client";
import { ConversationMessage, Markdown } from "@dust-tt/sparkle";
import { formatTimestring } from "@extension/shared/lib/utils";
import { AgentSuggestion } from "@extension/ui/components/conversation/AgentSuggestion";
import {
  AgentMentionBlock,
  agentMentionDirective,
} from "@extension/ui/components/markdown/AgentMentionBlock";
import {
  CiteBlock,
  getCiteDirective,
} from "@extension/ui/components/markdown/CiteBlock";
import {
  ContentNodeMentionBlock,
  contentNodeMentionDirective,
} from "@extension/ui/components/markdown/ContentNodeMentionBlock";
import {
  getUserMentionPlugin,
  userMentionDirective,
} from "@extension/ui/components/markdown/UserMentionBlock";
import type React from "react";
import { useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversationId: string;
  isLastMessage: boolean;
  message: UserMessageType;
  owner: LightWorkspaceType;
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
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: AgentMentionBlock,
      mention_user: getUserMentionPlugin(),
      content_node_mention: ContentNodeMentionBlock,
    }),
    []
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [
      getCiteDirective(),
      agentMentionDirective,
      userMentionDirective,
      contentNodeMentionDirective,
    ],
    []
  );

  return (
    <div className="flex flex-grow flex-col">
      <div className="min-w-60 max-w-[85%] self-end">
        <ConversationMessage
          pictureUrl={message.user?.image || message.context.profilePictureUrl}
          name={message.context.fullName ?? undefined}
          renderName={(name) => name}
          type="user"
          citations={citations}
          timestamp={formatTimestring(message.created)}
        >
          <div className="flex flex-col gap-4">
            <div>
              <Markdown
                content={message.content}
                isStreaming={false}
                isLastMessage={isLastMessage}
                additionalMarkdownComponents={additionalMarkdownComponents}
                additionalMarkdownPlugins={additionalMarkdownPlugins}
                compactSpacing
                canCopyQuotes={false}
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
      </div>
    </div>
  );
}
