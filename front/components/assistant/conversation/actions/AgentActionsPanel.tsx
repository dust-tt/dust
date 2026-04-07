import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { AgentActionsPanelHeader } from "@app/components/assistant/conversation/actions/AgentActionsPanelHeader";
import { AgentActionSummary } from "@app/components/assistant/conversation/actions/AgentActionsPanelSummary";
import { PanelAgentStep } from "@app/components/assistant/conversation/actions/PanelAgentStep";
import {
  parseDataAsMessageIdAndActionId,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { MessageTemporaryState } from "@app/components/assistant/conversation/types";
import { getIcon } from "@app/components/resources/resources_icons";
import {
  useAgentMessageSkills,
  useAgentMessageTools,
  useConversationMessage,
  useConversationMessageAction,
} from "@app/hooks/conversations";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/llms/agent_message_content_parser";
import { getSkillIcon } from "@app/lib/skill";
import {
  isAgentFunctionCallContent,
  isAgentReasoningContent,
  isAgentTextContent,
} from "@app/types/assistant/agent_message_content";
import type {
  AgentMessageStatus,
  AgentMessageType,
  ConversationWithoutContentType,
  ParsedContentItem,
} from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, Spinner, XMarkIcon } from "@dust-tt/sparkle";

import type React from "react";
import { useEffect, useRef, useState } from "react";

interface AgentActionsPanelProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

interface AgentActionsPanelContentProps {
  conversation: ConversationWithoutContentType | null;
  owner: LightWorkspaceType;
  fullAgentMessage: AgentMessageType;
  virtuosoMsg?: MessageTemporaryState | null;
  closeIcon: React.ComponentType<{}>;
  closePanel: () => void;
  mutateMessage: () => void;
}

function AgentActionsPanelContent({
  conversation,
  owner,
  fullAgentMessage,
  virtuosoMsg,
  closeIcon,
  closePanel,
  mutateMessage,
}: AgentActionsPanelContentProps) {
  const messageId = fullAgentMessage.sId;
  const [currentStreamingStep, setCurrentStreamingStep] = useState(1);
  const [successActionIds, setSuccessActionIds] = useState<string[]>([]);
  const [lastMessageStreamStatus, setLastMessageStreamStatus] =
    useState<AgentMessageStatus | null>(null);

  const { skills, mutateSkills } = useAgentMessageSkills({
    conversation,
    owner,
    messageId,
  });

  const { tools, mutateTools } = useAgentMessageTools({
    owner,
    conversation,
    agentConfigurationId: fullAgentMessage.configuration.sId,
  });

  // The message from Virtuoso doesn't contain the contents array and only actions if it's has been streamed.
  // So if it's not in a "created" status, we focus on the fullAgentMessage from the backend call.
  const rawMessageStreamState =
    virtuosoMsg && virtuosoMsg.sId === messageId ? virtuosoMsg : null;

  // Make it null to ignore it in the rendering and consider only the fullAgentMessage from the backend call.
  const messageStreamState =
    rawMessageStreamState?.status === "created" ? rawMessageStreamState : null;

  useEffect(() => {
    if (!rawMessageStreamState) {
      return;
    }

    const currentMaxStep = Math.max(
      currentStreamingStep,
      Math.max(...rawMessageStreamState.actions.map((a) => a.step)) + 1
    );

    // Check if we moved to a new step.
    if (currentMaxStep > currentStreamingStep) {
      setCurrentStreamingStep(currentMaxStep);
    }

    // Check if any new actions have been completed.
    const prevCompletedActionsCount = successActionIds.length;
    const newCompletedActionsCount = rawMessageStreamState.actions.filter(
      (a) => a.status === "succeeded"
    ).length;
    if (newCompletedActionsCount > prevCompletedActionsCount) {
      setSuccessActionIds(
        rawMessageStreamState.actions
          .filter((a) => a.status === "succeeded")
          .map((a) => a.sId)
      );
      mutateMessage();
      return;
    }

    if (lastMessageStreamStatus === rawMessageStreamState.status) {
      return;
    }

    // The message status changed, upate everything.
    setLastMessageStreamStatus(rawMessageStreamState?.status ?? null);
    void mutateMessage();
    void mutateSkills();
    void mutateTools();
  }, [
    rawMessageStreamState,
    currentStreamingStep,
    successActionIds,
    lastMessageStreamStatus,
    mutateMessage,
    mutateSkills,
    mutateTools,
  ]);

  const [steps, setSteps] = useState<Record<number, ParsedContentItem[]>>({});

  useEffect(() => {
    async function generateParsedContents() {
      const actions = fullAgentMessage.actions;
      const agentConfiguration = fullAgentMessage.configuration;
      const messageId = fullAgentMessage.sId;
      const contents = fullAgentMessage.contents;
      const parsedContents: Record<number, ParsedContentItem[]> = {};
      const actionsByCallId = new Map(
        actions.map((a) => [a.functionCallId, a])
      );

      for (const c of contents) {
        const step = c.step + 1; // Convert to 1-indexed for display
        if (!parsedContents[step]) {
          parsedContents[step] = [];
        }

        if (isAgentReasoningContent(c.content)) {
          const reasoning = c.content.value.reasoning;
          if (reasoning && reasoning.trim()) {
            parsedContents[step].push({
              kind: "reasoning",
              content: reasoning,
            });
          }
          continue;
        }

        if (isAgentTextContent(c.content)) {
          const contentParser = new AgentMessageContentParser(
            agentConfiguration,
            messageId,
            getDelimitersConfiguration({ agentConfiguration })
          );
          const parsedContent = await contentParser.parseContents([
            c.content.value,
          ]);

          if (
            parsedContent.chainOfThought &&
            parsedContent.chainOfThought.trim()
          ) {
            parsedContents[step].push({
              kind: "reasoning",
              content: parsedContent.chainOfThought,
            });
          }
          continue;
        }

        if (isAgentFunctionCallContent(c.content)) {
          const functionCallId = c.content.value.id;
          const matchingAction = actionsByCallId.get(functionCallId);

          if (matchingAction) {
            parsedContents[step].push({
              kind: "action",
              action: matchingAction,
            });
          }
        }
      }
      setSteps(parsedContents);
    }
    generateParsedContents().catch(console.error);
  }, [
    fullAgentMessage.actions,
    fullAgentMessage.configuration,
    fullAgentMessage.sId,
    fullAgentMessage.contents,
  ]);

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
    if (messageStreamState?.chainOfThought) {
      lastChainOfThoughtRef.current = {
        step: currentStreamingStep,
        content: messageStreamState.chainOfThought,
      };
    }
  }, [messageStreamState?.chainOfThought, currentStreamingStep]);

  useEffect(() => {
    if (!messageStreamState) {
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
  }, [messageStreamState]);

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

  const streamActionProgress =
    messageStreamState?.streaming.actionProgress ?? new Map();
  const pendingToolCalls = messageStreamState?.streaming.pendingToolCalls ?? [];
  return (
    <div className="flex h-full flex-col bg-background dark:bg-background-night">
      <AgentActionsPanelHeader
        closeIcon={closeIcon}
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
                  messageStatus={fullAgentMessage.status}
                />
              );
            })}
          {/* Show current streaming step with live updates. */}
          {messageStreamState &&
            messageStreamState.streaming.agentState !== "done" &&
            !steps[currentStreamingStep] && (
              <PanelAgentStep
                stepNumber={currentStreamingStep}
                reasoningContent={
                  lastChainOfThoughtRef.current.step === currentStreamingStep
                    ? lastChainOfThoughtRef.current.content
                    : "Thinking..."
                }
                isStreaming={
                  messageStreamState.streaming.agentState === "thinking"
                }
                pendingToolCalls={pendingToolCalls}
                streamingActions={
                  messageStreamState.streaming.agentState === "acting"
                    ? messageStreamState.actions.filter((action) => {
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
              />
            )}
          {!messageStreamState && (
            <AgentActionSummary
              agentMessageToRender={fullAgentMessage}
              nbSteps={nbSteps}
            />
          )}
          <div>&nbsp;</div>
        </div>
      </div>
      {(skills.length > 0 || tools.length > 0) && (
        <div className="flex flex-col gap-4 border-t border-separator bg-background p-4 dark:border-separator-night dark:bg-background-night">
          <span className="text-semibold text-sm">Enabled capabilities</span>
          <div className="flex flex-wrap items-center gap-1">
            {skills.map((skill) => (
              <Chip
                key={skill.sId}
                size="xs"
                color="blue"
                label={skill.name}
                icon={getSkillIcon(skill.icon)}
              />
            ))}
            {tools.map((tool) => (
              <Chip
                key={tool.sId}
                size="xs"
                label={tool.name ?? tool.server.name}
                icon={getIcon(tool.server.icon)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface AgentSingleActionPanelProps extends AgentActionsPanelProps {
  messageId: string;
  actionId: string;
  closeIcon?: React.ComponentType;
  onClose: () => void;
}

function AgentSingleActionPanel({
  conversation,
  owner,
  messageId,
  actionId,
  closeIcon = XMarkIcon,
  onClose,
}: AgentSingleActionPanelProps) {
  const { action, messageStatus, isActionLoading } =
    useConversationMessageAction({
      conversationId: conversation.sId,
      workspaceId: owner.sId,
      messageId,
      actionId,
    });

  if (isActionLoading) {
    return (
      <AgentActionsPanelHeader
        title="Tool detail"
        closeIcon={closeIcon}
        onClose={onClose}
      >
        <div className="flex items-center justify-center">
          <Spinner variant="color" />
        </div>
      </AgentActionsPanelHeader>
    );
  }

  if (!action) {
    return (
      <AgentActionsPanelHeader
        title="Tool detail"
        closeIcon={closeIcon}
        onClose={onClose}
      >
        <div className="flex items-center justify-center">
          <span className="text-muted-foreground dark:text-muted-foreground-night">
            Nothing to display.
          </span>
        </div>
      </AgentActionsPanelHeader>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background dark:bg-background-night">
      <AgentActionsPanelHeader
        title="Tool detail"
        closeIcon={closeIcon}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto p-4 pb-12">
        <MCPActionDetails
          displayContext="sidebar-single-action"
          action={action}
          lastNotification={null}
          owner={owner}
          messageStatus={messageStatus}
        />
      </div>
    </div>
  );
}

// TODO(2026-04-07: inline activity): can be deprecated in favor of AgentSingleActionPanel with inline activity.
export function AgentActionsPanelForMessage({
  conversation,
  owner,
  messageId,
  virtuosoMsg,
  closeIcon = XMarkIcon,
  onClose,
}: AgentActionsPanelProps & {
  messageId: string;
  virtuosoMsg: MessageTemporaryState | null;
  closeIcon?: React.ComponentType<{}>;
  onClose: () => void;
}) {
  const {
    message: fullAgentMessage,
    isMessageLoading,
    mutateMessage,
  } = useConversationMessage({
    conversationId: conversation.sId,
    workspaceId: owner.sId,
    messageId,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [fullAgentMessage]);

  if (isMessageLoading) {
    return (
      <AgentActionsPanelHeader
        title="Breakdown of the tools used"
        closeIcon={closeIcon}
        onClose={onClose}
      >
        <div className="flex items-center justify-center">
          <Spinner variant="color" />
        </div>
      </AgentActionsPanelHeader>
    );
  }

  if (!fullAgentMessage || fullAgentMessage.type !== "agent_message") {
    return (
      <AgentActionsPanelHeader
        title="Breakdown of the tools used"
        closeIcon={closeIcon}
        onClose={onClose}
      >
        <div className="flex items-center justify-center">
          <span className="text-muted-foreground dark:text-muted-foreground-night">
            Nothing to display.
          </span>
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
      virtuosoMsg={virtuosoMsg}
      closeIcon={closeIcon}
      closePanel={onClose}
      mutateMessage={mutateMessage}
    />
  );
}

export function AgentActionsPanel({
  conversation,
  owner,
}: AgentActionsPanelProps) {
  const {
    onPanelClosed,
    virtuosoMsg,
    data: rawData,
  } = useConversationSidePanelContext();

  const { messageId, actionId } = parseDataAsMessageIdAndActionId(rawData);

  if (!messageId) {
    return null;
  }

  if (actionId) {
    return (
      <AgentSingleActionPanel
        conversation={conversation}
        owner={owner}
        messageId={messageId}
        actionId={actionId}
        onClose={onPanelClosed}
      />
    );
  }

  return (
    <AgentActionsPanelForMessage
      conversation={conversation}
      owner={owner}
      messageId={messageId}
      virtuosoMsg={virtuosoMsg}
      onClose={onPanelClosed}
    />
  );
}
