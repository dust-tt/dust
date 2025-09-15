/* eslint-disable @typescript-eslint/no-unused-vars */
import { formatMessageTime } from "@app/shared/lib/utils";
import { AgentSuggestion } from "@app/ui/components/conversation/AgentSuggestion";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/ui/components/markdown/CiteBlock";
import {
  ContentNodeMentionBlock,
  contentNodeMentionDirective,
} from "@app/ui/components/markdown/ContentNodeMentionBlock";
import {
  MentionBlock,
  mentionDirective,
} from "@app/ui/components/markdown/MentionBlock";
import type { LightWorkspaceType, UserMessageType } from "@dust-tt/client";
import { ConversationMessage, Markdown } from "@dust-tt/sparkle";
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
      mention: MentionBlock,
      content_node_mention: ContentNodeMentionBlock,
    }),
    []
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [getCiteDirective(), mentionDirective, contentNodeMentionDirective],
    []
  );

  return (
    <div className="flex flex-grow flex-col">
      <div className="self-end max-w-[85%] min-w-60">
        <ConversationMessage
          pictureUrl={message.user?.image || message.context.profilePictureUrl}
          name={message.context.fullName ?? undefined}
          renderName={(name) => name}
          type="user"
          citations={citations}
          timestamp={formatMessageTime(message.created)}
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
