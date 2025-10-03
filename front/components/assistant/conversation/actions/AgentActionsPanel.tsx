import { Spinner } from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AgentActionsPanelHeader } from "@app/components/assistant/conversation/actions/AgentActionsPanelHeader";
import { AgentActionSummary } from "@app/components/assistant/conversation/actions/AgentActionsPanelSummary";
import { PanelAgentStep } from "@app/components/assistant/conversation/actions/PanelAgentStep";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useAgentMessageStream } from "@app/hooks/useAgentMessageStream";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import { useConversationMessage } from "@app/lib/swr/conversations";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
  LightWorkspaceType,
  ParsedContentItem,
} from "@app/types";

interface AgentActionsPanelProps {
  conversation: ConversationWithoutContentType;
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

function AgentActionsPanelContent({
  conversation,
  owner,
  fullAgentMessage,
  messageId,
  closePanel,
  mutateMessage,
}: AgentActionsPanelContentProps) {
  const [currentStreamingStep, setCurrentStreamingStep] = useState(1);

  const { messageStreamState, shouldStream, isFreshMountWithContent } =
    useAgentMessageStream({
      message: getLightAgentMessageFromAgentMessage(fullAgentMessage),
      conversationId: conversation?.sId ?? null,
      owner,
      mutateMessage,
      onEventCallback: useCallback(
        (eventStr: string) => {
          const eventPayload = JSON.parse(eventStr);

          if (currentStreamingStep !== eventPayload.data.step + 1) {
            setCurrentStreamingStep(eventPayload.data.step + 1);
          }
        },
        [currentStreamingStep]
      ),
      streamId: `actions-panel-${messageId}`,
      useFullChainOfThought: true,
    });

  useEffect(() => {
    if (
      fullAgentMessage?.type === "agent_message" &&
      fullAgentMessage?.status === "created" &&
      !!fullAgentMessage.chainOfThought
    ) {
      isFreshMountWithContent.current = true;
    }
  }, [fullAgentMessage, isFreshMountWithContent]);

  const steps =
    fullAgentMessage?.type === "agent_message"
      ? fullAgentMessage.parsedContents
      : {};

  const nbSteps = Object.entries(steps || {}).filter(
    ([, entries]) => Array.isArray(entries) && entries.length > 0
  ).length;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Track whether the user is currently scrolled to the bottom of the panel
  const shouldAutoScroll = useRef<boolean>(true);

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
    if (!shouldStream) {
      return;
    }

    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }

    if (shouldAutoScroll.current) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [fullAgentMessage, messageStreamState, shouldStream]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const scrollUp =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      Number(el.scrollTop) < Number(el.dataset.lastScrollTop || 0);

    el.dataset.lastScrollTop = el.scrollTop.toString();
    /**
     * 1000px threshold is used to determine if the user is at the bottom of the panel.
     * If the user is within 1000px of the bottom, we consider them to be at the bottom.
     * This is to prevent losing auto-scroll when we receive a visually BIG chunk.
     */
    const threshold = 1000;
    shouldAutoScroll.current =
      !scrollUp &&
      el.scrollHeight - el.clientHeight <= el.scrollTop + threshold;
  };

  const agentMessageToRender = (() => {
    switch (fullAgentMessage.status) {
      case "succeeded":
      case "failed":
        return fullAgentMessage;
      case "cancelled":
        if (messageStreamState.message.status === "created") {
          return {
            ...messageStreamState.message,
            status: "cancelled" as const,
          };
        }
        return messageStreamState.message;
      case "created":
        return messageStreamState.message;
      default:
        return fullAgentMessage;
    }
  })();

  const streamActionProgress = messageStreamState?.actionProgress ?? new Map();
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
        <div className="flex h-full flex-col gap-4">
          {/* Render all parsed steps in order */}
          {Object.entries(steps || {})
            .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
            .map(([step, entries]) => {
              if (!entries || !Array.isArray(entries) || entries.length === 0) {
                return null;
              }

              return (
                <PanelAgentStep
                  key={step}
                  stepNumber={parseInt(step, 10)}
                  entries={entries}
                  streamActionProgress={streamActionProgress}
                  owner={owner}
                  messageStatus={
                    agentMessageToRender?.type === "agent_message"
                      ? agentMessageToRender.status
                      : "succeeded"
                  }
                  showSeparator={step !== "1"}
                />
              );
            })}
          {/* Show current streaming step with live updates. */}
          {shouldStream &&
            messageStreamState.agentState !== "done" &&
            !steps[currentStreamingStep] && (
              <PanelAgentStep
                stepNumber={currentStreamingStep}
                reasoningContent={
                  lastChainOfThoughtRef.current.step === currentStreamingStep
                    ? lastChainOfThoughtRef.current.content
                    : "Thinking..."
                }
                isStreaming={messageStreamState.agentState === "thinking"}
                streamingActions={
                  messageStreamState.agentState === "acting"
                    ? messageStreamState.message.actions.filter((action) => {
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
                    : []
                }
                streamActionProgress={streamActionProgress}
                owner={owner}
                messageStatus="created"
                showSeparator={currentStreamingStep > 1}
              />
            )}
          {!shouldStream && (
            <AgentActionSummary
              agentMessageToRender={agentMessageToRender}
              nbSteps={nbSteps}
            />
          )}
          <div>&nbsp;</div>
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
    conversationId: conversation.sId,
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

  // Use key to force remount when the message changes for proper state reset.
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
