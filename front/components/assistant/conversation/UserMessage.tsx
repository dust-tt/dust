import {
  Avatar,
  ClockIcon,
  ConversationMessage,
  Markdown,
  Tooltip,
} from "@dust-tt/sparkle";
import { BellIcon } from "lucide-react";
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
import { formatMessageTime } from "@app/lib/utils/timestamps";
import type { UserMessageType, WorkspaceType } from "@app/types";

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
          timestamp={formatMessageTime(message.created)}
          infoChip={
            message.context.origin === "triggered" && (
              <TriggerChip message={message} />
            )
          }
          type="user"
          citations={citations}
        >
          <Markdown
            content={message.content}
            isStreaming={false}
            isLastMessage={isLastMessage}
            additionalMarkdownComponents={additionalMarkdownComponents}
            additionalMarkdownPlugins={additionalMarkdownPlugins}
          />
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

function TriggerChip({ message }: { message?: UserMessageType }) {
  const getChipDateFormat = (date: Date) => {
    return date.toLocaleDateString("en-EN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const label = (function () {
    if (message?.context.lastTriggerRunAt) {
      return (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-bold">Scheduled and sent automatically</span>
          {message?.created && (
            <span>
              <span className="font-semibold">Current execution</span>:{" "}
              {getChipDateFormat(new Date(message?.created))}
            </span>
          )}
          {message?.context.lastTriggerRunAt && (
            <span>
              <span className="font-semibold">Previous run</span>:{" "}
              {getChipDateFormat(new Date(message?.context.lastTriggerRunAt))}
            </span>
          )}
        </div>
      );
    } else {
      return (
        <span className="font-bold">Triggered and sent automatically</span>
      );
    }
  })();

  const icon = message?.context.lastTriggerRunAt ? (
    <ClockIcon className="h-4 w-4" />
  ) : (
    <BellIcon className="h-4 w-4" />
  );

  return <Tooltip label={label} trigger={<Avatar size="xs" visual={icon} />} />;
}
