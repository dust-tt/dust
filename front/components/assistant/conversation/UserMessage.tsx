import {
  BoltIcon,
  classNames,
  ConversationMessage,
  Icon,
  Markdown,
  Tooltip,
} from "@dust-tt/sparkle";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import { useCallback, useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import { NewConversationMessage } from "@app/components/assistant/conversation/NewConversationMessage";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import {
  hasHumansInteracting,
  isTriggeredOrigin,
} from "@app/components/assistant/conversation/types";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  ContentNodeMentionBlock,
  contentNodeMentionDirective,
} from "@app/components/markdown/ContentNodeMentionBlock";
import {
  PastedAttachmentBlock,
  pastedAttachmentDirective,
} from "@app/components/markdown/PastedAttachmentBlock";
import {
  agentMentionDirective,
  getAgentMentionPlugin,
  getUserMentionPlugin,
  userMentionDirective,
} from "@app/lib/mentions/markdown/plugin";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type { UserMessageType, WorkspaceType } from "@app/types";

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversationId: string;
  currentUserId: string;
  isLastMessage: boolean;
  message: UserMessageType;
  owner: WorkspaceType;
}

export function UserMessage({
  citations,
  conversationId,
  currentUserId,
  isLastMessage,
  message,
  owner,
}: UserMessageProps) {
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const userMentionsEnabled = hasFeature("mentions_v2");

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: getAgentMentionPlugin(owner),
      mention_user: getUserMentionPlugin(owner),
      content_node_mention: ContentNodeMentionBlock,
      pasted_attachment: PastedAttachmentBlock,
    }),
    [owner]
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [
      getCiteDirective(),
      agentMentionDirective,
      userMentionDirective,
      contentNodeMentionDirective,
      pastedAttachmentDirective,
    ],
    []
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

  if (userMentionsEnabled) {
    const isCurrentUser = message.user?.sId === currentUserId;
    return (
      <div className="flex flex-grow flex-col">
        <div
          className={classNames(
            "flex w-full min-w-60 flex-col",
            isCurrentUser ? "items-end" : "items-start"
          )}
        >
          <NewConversationMessage
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            pictureUrl={
              message.context.profilePictureUrl ?? message.user?.image
            }
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
            isCurrentUser={isCurrentUser}
            citations={citations}
          >
            <Markdown
              content={message.content}
              isStreaming={false}
              isLastMessage={isLastMessage}
              additionalMarkdownComponents={additionalMarkdownComponents}
              additionalMarkdownPlugins={additionalMarkdownPlugins}
            />
          </NewConversationMessage>
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

  return (
    <div className="flex flex-grow flex-col">
      <div className="min-w-60 max-w-full self-end">
        <ConversationMessage
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          pictureUrl={message.context.profilePictureUrl || message.user?.image}
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
          <Markdown
            content={message.content}
            isStreaming={false}
            isLastMessage={isLastMessage}
            additionalMarkdownComponents={additionalMarkdownComponents}
            additionalMarkdownPlugins={additionalMarkdownPlugins}
          />
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
