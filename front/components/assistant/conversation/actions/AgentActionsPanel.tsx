import {
  assertNever,
  ContentMessage,
  Markdown,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef } from "react";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { AgentActionsPanelHeader } from "@app/components/assistant/conversation/actions/AgentActionsPanelHeader";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useEventSource } from "@app/hooks/useEventSource";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type {
  AgentMessageStateEvent,
  MessageTemporaryState,
} from "@app/lib/assistant/state/messageReducer";
import {
  CLEAR_CONTENT_EVENT,
  messageReducer,
} from "@app/lib/assistant/state/messageReducer";
import { useConversationMessage } from "@app/lib/swr/conversations";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
  LightAgentMessageType,
  LightWorkspaceType,
  ParsedContentItem,
} from "@app/types";

interface AgentActionsPanelProps {
  conversation: ConversationWithoutContentType | null;
  owner: LightWorkspaceType;
}

type AgentMessageStateWithControlEvent =
  | AgentMessageStateEvent
  | { type: "end-of-stream" };

function makeInitialMessageStreamState(
  message: LightAgentMessageType
): MessageTemporaryState {
  return {
    actionProgress: new Map(),
    agentState: message.status === "created" ? "thinking" : "done",
    isRetrying: false,
    lastUpdated: new Date(),
    message,
  };
}

function AgentActionsPanelContent({
  conversation,
  owner,
  fullAgentMessage,
  messageId,
  messageMetadata,
  closePanel,
  mutateMessage,
}: {
  conversation: ConversationWithoutContentType | null;
  owner: LightWorkspaceType;
  fullAgentMessage: AgentMessageType;
  messageId: string;
  messageMetadata: any;
  closePanel: () => void;
  mutateMessage: () => void;
}) {
  const [messageStreamState, dispatch] = React.useReducer(
    messageReducer,
    makeInitialMessageStreamState(
      getLightAgentMessageFromAgentMessage(fullAgentMessage)
    )
  );

  const isFreshMountWithContent = React.useRef(
    fullAgentMessage?.type === "agent_message" &&
      fullAgentMessage?.status === "created" &&
      !!fullAgentMessage.chainOfThought
  );

  React.useEffect(() => {
    isFreshMountWithContent.current =
      fullAgentMessage?.type === "agent_message" &&
      fullAgentMessage?.status === "created" &&
      !!fullAgentMessage.chainOfThought;
  }, [fullAgentMessage?.sId]);

  const steps =
    fullAgentMessage?.type === "agent_message"
      ? fullAgentMessage.parsedContents
      : {};

  const maxParsedStep = Math.max(...Object.keys(steps || {}).map(Number), 0);
  const currentStreamingStep = maxParsedStep + 1;

  const shouldStream = React.useMemo(() => {
    if (fullAgentMessage.status !== "created") {
      return false;
    }

    switch (messageStreamState.message.status) {
      case "succeeded":
      case "failed":
      case "cancelled":
        return false;
      case "created":
        return true;
      default:
        assertNever(messageStreamState.message.status);
    }
  }, [fullAgentMessage.status, messageStreamState.message.status]);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      if (!shouldStream || !conversation?.sId || !messageId) {
        return null;
      }
      const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}/messages/${messageId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: {
          eventId: string;
        } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
        // We have a lastEventId, so this is not a fresh mount
        isFreshMountWithContent.current = false;
      }
      const url = esURL + "?lastEventId=" + lastEventId;
      return url;
    },
    [shouldStream, owner.sId, conversation?.sId, messageId]
  );

  const onEventCallback = React.useCallback(
    (eventStr: string) => {
      const eventPayload: {
        eventId: string;
        data: AgentMessageStateWithControlEvent;
      } = JSON.parse(eventStr);
      const eventType = eventPayload.data.type;

      // This event is emitted in front/lib/api/assistant/pubsub.ts. Its purpose is to signal the
      // end of the stream to the client. The message reducer does not, and should not, handle this
      // event, so we just return.
      if (eventType === "end-of-stream") {
        return;
      }

      if (eventType === "tool_approve_execution") {
        return;
      }

      // If this is a fresh mount with existing content and we're getting generation_tokens,
      // we need to clear the content first to avoid duplication
      if (
        isFreshMountWithContent.current &&
        eventType === "generation_tokens" &&
        (eventPayload.data.classification === "tokens" ||
          eventPayload.data.classification === "chain_of_thought")
      ) {
        // Clear the existing content from the state
        dispatch(CLEAR_CONTENT_EVENT);
        isFreshMountWithContent.current = false;
      }

      const shouldRefresh = [
        "agent_action_success",
        "agent_error",
        "agent_message_success",
        "agent_generation_cancelled",
      ].includes(eventType);

      if (shouldRefresh) {
        void mutateMessage();
      }

      dispatch(eventPayload.data);
    },
    [mutateMessage]
  );

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `actions-panel-${messageId}`
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Keep track of the last chain of thought content before it gets reset
  const lastChainOfThoughtRef = useRef<string>("");

  useEffect(() => {
    if (messageStreamState.message?.chainOfThought) {
      lastChainOfThoughtRef.current = messageStreamState.message.chainOfThought;
    }
  }, [messageStreamState.message?.chainOfThought]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [fullAgentMessage, messageStreamState]);

  const agentMessageToRender =
    shouldStream && messageStreamState
      ? messageStreamState.message
      : fullAgentMessage;

  const { actionProgress } = messageMetadata;
  const streamActionProgress = messageStreamState?.actionProgress ?? new Map();
  const isActing =
    (agentMessageToRender?.type === "agent_message" &&
      agentMessageToRender.status === "created") ||
    (messageStreamState && messageStreamState.agentState !== "done");

  console.log(messageStreamState.message?.chainOfThought);

  return (
    <div className="flex h-full flex-col">
      <AgentActionsPanelHeader
        title="Breakdown of the tools used"
        onClose={closePanel}
      />
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 pb-12"
      >
        <div className="flex flex-col gap-4">
          {/* Render all parsed steps in order */}
          {Object.entries(steps || {})
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([step, entries]) => {
              if (!entries || !Array.isArray(entries) || entries.length === 0) {
                return null;
              }

              return (
                <div
                  className="flex flex-col gap-4 duration-500 animate-in fade-in slide-in-from-left-2"
                  key={step}
                >
                  {step !== "1" && <Separator className="my-4" />}
                  <div className="flex items-center gap-2">
                    <span className="text-size w-fit self-start text-lg font-semibold">
                      Step {step}
                    </span>
                  </div>

                  {entries.map((entry: any, idx: number) => {
                    if (entry.kind === "reasoning") {
                      return (
                        <div key={`reasoning-${step}-${idx}`}>
                          <ContentMessage variant="primary" size="lg">
                            <Markdown
                              content={entry.content}
                              isStreaming={false}
                              forcedTextSize="text-sm"
                              textColor="text-muted-foreground"
                              isLastMessage={false}
                            />
                          </ContentMessage>
                        </div>
                      );
                    } else {
                      const streamProgress = streamActionProgress.get(
                        entry.action.id
                      )?.progress;
                      const metadataProgress = actionProgress.get(
                        entry.action.id
                      )?.progress;
                      const lastNotification =
                        streamProgress ?? metadataProgress ?? null;

                      return (
                        <div key={`action-${entry.action.id}`}>
                          <MCPActionDetails
                            viewType="sidebar"
                            action={entry.action}
                            lastNotification={lastNotification}
                            owner={owner}
                            messageStatus={
                              agentMessageToRender?.type === "agent_message"
                                ? agentMessageToRender.status
                                : "succeeded"
                            }
                          />
                        </div>
                      );
                    }
                  })}
                </div>
              );
            })}

          {/* Show current streaming step at the bottom */}
          {shouldStream &&
            messageStreamState.agentState !== "done" &&
            !steps[currentStreamingStep] && (
              <div className="flex flex-col gap-4 duration-500 animate-in fade-in slide-in-from-left-2">
                {currentStreamingStep > 1 && <Separator className="my-4" />}
                <div className="flex items-center gap-2">
                  <span className="text-size w-fit self-start text-lg font-semibold">
                    Step {currentStreamingStep}
                  </span>
                </div>
                <div className="transition-all duration-300 animate-in fade-in slide-in-from-bottom-1">
                  <ContentMessage variant="primary" size="lg">
                    <Markdown
                      content={lastChainOfThoughtRef.current}
                      isStreaming={messageStreamState.agentState === "thinking"}
                      forcedTextSize="text-sm"
                      textColor="text-muted-foreground"
                      isLastMessage={false}
                    />
                    {messageStreamState.agentState === "thinking" && (
                      <div className="ml-1 inline-block h-3 w-[2px] animate-pulse bg-blue-500" />
                    )}
                  </ContentMessage>
                </div>

                {/* Show streaming actions when acting */}
                {messageStreamState.agentState === "acting" &&
                  messageStreamState.message.actions.length > 0 && (
                    <div className="mt-4">
                      {messageStreamState.message.actions
                        .filter((action: any) => {
                          return !Object.values(steps || {}).some(
                            (entries: ParsedContentItem[]) =>
                              Array.isArray(entries) &&
                              entries.some(
                                (entry) =>
                                  entry.kind === "action" &&
                                  entry.action?.id === action.id
                              )
                          );
                        })
                        .map((action: any) => {
                          const streamProgress = streamActionProgress.get(
                            action.id
                          )?.progress;
                          const lastNotification = streamProgress ?? null;

                          return (
                            <div
                              key={`streaming-action-${action.id}`}
                              className="mb-4"
                            >
                              <MCPActionDetails
                                viewType="sidebar"
                                action={action}
                                lastNotification={lastNotification}
                                owner={owner}
                                messageStatus="created"
                              />
                            </div>
                          );
                        })}
                    </div>
                  )}
              </div>
            )}
          {isActing && (
            <div className="flex justify-center">
              <Spinner variant="color" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentActionsPanel({
  conversation,
  owner,
}: AgentActionsPanelProps) {
  const {
    onPanelClosed,
    data: messageId,
    metadata: messageMetadata,
  } = useConversationSidePanelContext();

  const {
    message: fullAgentMessage,
    isMessageLoading,
    mutateMessage,
  } = useConversationMessage({
    conversationId: conversation?.sId ?? null,
    workspaceId: owner.sId,
    messageId: messageId ?? null,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [fullAgentMessage]);

  useEffect(() => {
    if (!messageId) {
      onPanelClosed();
    }
  }, [messageId]);

  if (
    !messageId ||
    !messageMetadata ||
    !fullAgentMessage ||
    fullAgentMessage.type !== "agent_message"
  ) {
    return null;
  }

  if (isMessageLoading) {
    return (
      <div className="flex h-full flex-col">
        <AgentActionsPanelHeader
          title="Breakdown of the tools used"
          onClose={onPanelClosed}
        />
        <div className="flex flex-1 items-center justify-center">
          <Spinner variant="color" />
        </div>
      </div>
    );
  }

  // Use key to force remount when message changes for proper state reset
  return (
    <AgentActionsPanelContent
      key={fullAgentMessage.sId}
      conversation={conversation}
      owner={owner}
      fullAgentMessage={fullAgentMessage}
      messageId={messageId}
      messageMetadata={messageMetadata}
      closePanel={onPanelClosed}
      mutateMessage={mutateMessage}
    />
  );
}
