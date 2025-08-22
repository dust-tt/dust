import {
  assertNever,
  ContentMessage,
  Markdown,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import type React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { AgentActionsPanelHeader } from "@app/components/assistant/conversation/actions/AgentActionsPanelHeader";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useEventSource } from "@app/hooks/useEventSource";
import type { MCPActionType } from "@app/lib/actions/mcp";
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

interface AgentActionsPanelContentProps {
  conversation: ConversationWithoutContentType | null;
  owner: LightWorkspaceType;
  fullAgentMessage: AgentMessageType;
  messageId: string;
  closePanel: () => void;
  mutateMessage: () => void;
}

type AgentMessageStateWithControlEvent =
  | AgentMessageStateEvent
  | { type: "end-of-stream" };

function isMCPActionType(
  action: { type: "tool_action"; id: number } | undefined
): action is MCPActionType {
  return action !== undefined && "functionCallName" in action;
}

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
  closePanel,
  mutateMessage,
}: AgentActionsPanelContentProps) {
  const [messageStreamState, dispatch] = useReducer(
    messageReducer,
    makeInitialMessageStreamState(
      getLightAgentMessageFromAgentMessage(fullAgentMessage)
    )
  );

  /**
   * This ref is used to determine if this is a fresh mount with content.
   * If it is, we need to clear the content when we start receiving
   * generation_tokens events to avoid duplication.
   * This is necessary because the content is already present in the state
   * when the component mounts, and we don't want to append to it.
   */
  const isFreshMountWithContent = useRef(
    fullAgentMessage?.type === "agent_message" &&
      fullAgentMessage?.status === "created" &&
      !!fullAgentMessage.chainOfThought
  );

  useEffect(() => {
    isFreshMountWithContent.current =
      fullAgentMessage?.type === "agent_message" &&
      fullAgentMessage?.status === "created" &&
      !!fullAgentMessage.chainOfThought;
  }, [
    fullAgentMessage?.sId,
    fullAgentMessage?.type,
    fullAgentMessage?.status,
    fullAgentMessage.chainOfThought,
  ]);

  const steps =
    fullAgentMessage?.type === "agent_message"
      ? fullAgentMessage.parsedContents
      : {};

  const [currentStreamingStep, setCurrentStreamingStep] = useState(1);

  const shouldStream = useMemo(() => {
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

  const onEventCallback = useCallback(
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

      if (currentStreamingStep !== eventPayload.data.step + 1) {
        setCurrentStreamingStep(eventPayload.data.step + 1);
      }

      if (eventType === "tool_approve_execution") {
        return;
      }

      /**
       * If this is a fresh mount with existing content and we're getting generation_tokens,
       * we need to clear the content first to avoid duplication.
       */
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
    [mutateMessage, currentStreamingStep]
  );

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `actions-panel-${messageId}`
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Track whether the user is currently scrolled to the bottom of the panel
  const isUserAtBottomRef = useRef<boolean>(true);

  /**
   * Preserve chain of thought content to prevent flickering during state transitions.
   * We store the step of the cot item to ensure we don't start displaying the next step
   * when a subagent is still running.
   */
  const lastChainOfThoughtRef = useRef<{ step: number; content: string }>({
    step: 0,
    content: "",
  });

  useEffect(() => {
    if (messageStreamState.message?.chainOfThought) {
      lastChainOfThoughtRef.current = {
        step: currentStreamingStep,
        content: messageStreamState.message.chainOfThought,
      };
    }
  }, [messageStreamState.message?.chainOfThought, currentStreamingStep]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }

    if (isUserAtBottomRef.current) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [fullAgentMessage, messageStreamState]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    /**
     * 1000px threshold is used to determine if the user is at the bottom of the panel.
     * If the user is within 1000px of the bottom, we consider them to be at the bottom.
     * This is to prevent loosing auto-scroll when we receive a visually BIG chunk.
     */
    const threshold = 1000;
    isUserAtBottomRef.current =
      el.scrollHeight - el.clientHeight <= el.scrollTop + threshold;
  };

  const agentMessageToRender =
    shouldStream && messageStreamState
      ? messageStreamState.message
      : fullAgentMessage;

  const streamActionProgress = messageStreamState?.actionProgress ?? new Map();
  const isActing =
    (agentMessageToRender?.type === "agent_message" &&
      agentMessageToRender.status === "created") ||
    (messageStreamState && messageStreamState.agentState !== "done");

  return (
    <div className="flex h-full flex-col">
      <AgentActionsPanelHeader
        title="Breakdown of the tools used"
        onClose={closePanel}
      />
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 pb-12"
        onScroll={handleScroll}
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

                  {entries.map((entry: ParsedContentItem, idx: number) => {
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
                    }

                    if (entry.kind !== "action") {
                      return null;
                    }

                    const streamProgress = streamActionProgress.get(
                      entry.action.id
                    )?.progress;

                    return (
                      <div key={`action-${entry.action.id}`}>
                        <MCPActionDetails
                          viewType="sidebar"
                          action={entry.action}
                          lastNotification={streamProgress ?? null}
                          owner={owner}
                          messageStatus={
                            agentMessageToRender?.type === "agent_message"
                              ? agentMessageToRender.status
                              : "succeeded"
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}

          {/* Show current streaming step with live updates. */}
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
                      content={
                        lastChainOfThoughtRef.current.step ===
                        currentStreamingStep
                          ? lastChainOfThoughtRef.current.content
                          : ""
                      }
                      isStreaming={messageStreamState.agentState === "thinking"}
                      forcedTextSize="text-sm"
                      textColor="text-muted-foreground"
                      isLastMessage={false}
                    />
                  </ContentMessage>
                </div>

                {/* Show streaming actions for current step only. */}
                {messageStreamState.agentState === "acting" &&
                  messageStreamState.message.actions.length > 0 && (
                    <div className="mt-4">
                      {messageStreamState.message.actions
                        .filter((action) => {
                          // Only show actions not yet in any completed step.
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
                        .map((action) => {
                          // Only render MCP actions with complete type information.
                          if (!isMCPActionType(action)) {
                            return null;
                          }

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
  const { onPanelClosed, data: messageId } = useConversationSidePanelContext();

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
  }, [messageId, onPanelClosed]);

  if (isMessageLoading) {
    return (
      <AgentActionsPanelHeader
        title="Breakdown of the tools used"
        onClose={onPanelClosed}
      >
        <div className="flex items-center justify-center">
          <Spinner variant="color" />
        </div>
      </AgentActionsPanelHeader>
    );
  }

  if (
    !messageId ||
    !fullAgentMessage ||
    fullAgentMessage.type !== "agent_message"
  ) {
    return (
      <AgentActionsPanelHeader
        title="Breakdown of the tools used"
        onClose={onPanelClosed}
      >
        <div className="flex items-center justify-center">
          <span className="text-muted-foreground">Nothing to display.</span>
        </div>
      </AgentActionsPanelHeader>
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
      closePanel={onPanelClosed}
      mutateMessage={mutateMessage}
    />
  );
}
