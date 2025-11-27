import { BoltIcon, ConversationMessage, Icon, Tooltip } from "@dust-tt/sparkle";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import React, { useCallback, useMemo } from "react";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import { renderMessageContent } from "@app/components/assistant/conversation/renderMessageContent";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import {
  hasHumansInteracting,
  isTriggeredOrigin,
} from "@app/components/assistant/conversation/types";
import { formatTimestring } from "@app/lib/utils/timestamps";
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
  const renderedContent = useMemo(
    () => renderMessageContent(message.content, owner),
    [message.content, owner]
  );

  const renderName = useCallback((name: string | null) => {
    return <div>{name}</div>;
  }, []);

  const methods = useVirtuosoMethods<VirtuosoMessage>();

  const showAgentSuggestions = useMemo(() => {
    return (
      message.mentions.length === 0 &&
      isLastMessage &&
      !hasHumansInteracting(methods.data.get())
    );
  }, [message.mentions.length, isLastMessage, methods.data]);

  return (
    <div className="flex flex-grow flex-col">
      <div className="min-w-60 max-w-full self-end">
        <ConversationMessage
          pictureUrl={message.context.profilePictureUrl ?? message.user?.image}
          name={message.context.fullName ?? undefined}
          renderName={renderName}
          timestamp={formatTimestring(message.created)}
          infoChip={
            isTriggeredOrigin(message.context.origin) && (
              <span className="translate-y-1 text-muted-foreground dark:text-muted-foreground-night">
                <TriggerChip message={message} />
              </span>
            )
          }
          type="user"
          citations={citations}
        >
          {renderedContent}
        </ConversationMessage>
      </div>
      {showAgentSuggestions && (
        <AgentSuggestion
          conversationId={conversationId}
          owner={owner}
          userMessage={message}
        />
      )}
    </div>
  );
}

function getChipDateFormat(date: Date) {
  return date.toLocaleDateString("en-EN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Label({ message }: { message?: UserMessageType }) {
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
    return <span className="font-bold">Triggered and sent automatically</span>;
  }
}

function TriggerChip({ message }: { message?: UserMessageType }) {
  return (
    <Tooltip
      label={<Label message={message} />}
      trigger={<Icon size="xs" visual={BoltIcon} />}
    />
  );
}
