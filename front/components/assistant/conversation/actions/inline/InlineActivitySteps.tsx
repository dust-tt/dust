import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import {
  getActionOneLineLabel,
  getPendingToolCallLabel,
} from "@app/components/assistant/conversation/actions/inline/types";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type {
  AgentStateClassification,
  InlineActivityStep,
  PendingToolCall,
} from "@app/components/assistant/conversation/types";
import type {
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
} from "@app/types/assistant/conversation";
import { isLightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  Button,
  ChatBubbleThoughtIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Markdown,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface InlineActivityStepsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  completedSteps: InlineActivityStep[];
  pendingToolCalls: PendingToolCall[];
}

/**
 * Inline activity steps component.
 * Everything is wrapped in a single collapsible "Work" section
 * with a stepper timeline containing CoT, actions, and a "Done" marker.
 *
 * Steps are accumulated by useAgentMessageStream — this component is a pure render.
 */
export function InlineActivitySteps({
  agentMessage,
  lastAgentStateClassification,
  completedSteps,
  pendingToolCalls,
}: InlineActivityStepsProps) {
  const isAgentMessageWithActions =
    isLightAgentMessageWithActionsType(agentMessage);
  const actions = isAgentMessageWithActions ? agentMessage.actions : [];
  const chainOfThought = agentMessage.chainOfThought ?? "";

  const { openPanel } = useConversationSidePanelContext();

  const [isCollapsed, setIsCollapsed] = useState(false);

  const openBreakdownPanel = () => {
    openPanel({
      type: "actions",
      messageId: agentMessage.sId,
    });
  };

  const isDone =
    lastAgentStateClassification === "done" || agentMessage.status === "failed";
  const isThinking = lastAgentStateClassification === "thinking";
  const isActing = lastAgentStateClassification === "acting";
  const hasPendingToolCalls = pendingToolCalls.length > 0;

  if (isDone && completedSteps.length === 0) {
    return null;
  }

  // Show active thinking whenever the agent is thinking.
  // Dedup in appendThinkingStep handles duplicate content at capture time.
  const showActiveThinking = isThinking && !hasPendingToolCalls;
  const activeAction =
    isActing && isAgentMessageWithActions ? actions[actions.length - 1] : null;

  const hasContent =
    completedSteps.length > 0 ||
    showActiveThinking ||
    activeAction ||
    hasPendingToolCalls;
  if (!hasContent) {
    return null;
  }

  return (
    <div className="flex flex-col">
      {/* Collapsible header */}
      <Button
        variant="ghost"
        size="xs"
        label={isDone ? "Work" : "Working\u2026"}
        icon={isCollapsed ? ChevronRightIcon : ChevronDownIcon}
        className="self-start text-muted-foreground dark:text-muted-foreground-night"
        onClick={() => setIsCollapsed((c) => !c)}
      />

      {/* Timeline content — click anywhere to open breakdown panel */}
      {!isCollapsed && (
        <div className="ml-5 mt-1 cursor-pointer" onClick={openBreakdownPanel}>
          {completedSteps.map((step, index) => {
            const isLast =
              index === completedSteps.length - 1 &&
              !showActiveThinking &&
              !activeAction &&
              !isDone;

            switch (step.type) {
              case "thinking":
                return (
                  <TimelineRow
                    key={step.id}
                    icon={ChatBubbleThoughtIcon}
                    isLast={isLast}
                  >
                    <Markdown
                      content={step.content}
                      isStreaming={false}
                      forcedTextSize="text-sm"
                      textColor="text-muted-foreground dark:text-muted-foreground-night"
                      isLastMessage={false}
                    />
                  </TimelineRow>
                );
              case "action":
                return (
                  <TimelineRow key={step.id} icon={CheckIcon} isLast={isLast}>
                    <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {getActionOneLineLabel(step.action)}
                    </span>
                  </TimelineRow>
                );
              default:
                assertNever(step);
            }
          })}

          {pendingToolCalls.map((toolCall, index) => {
            const isLastPendingToolCall =
              index === pendingToolCalls.length - 1 && !activeAction && !isDone;

            return (
              <TimelineRow
                key={toolCall.key}
                spinner={isLastPendingToolCall}
                isLast={isLastPendingToolCall}
              >
                <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {getPendingToolCallLabel(toolCall.name)}
                </span>
              </TimelineRow>
            );
          })}

          {/* Active thinking (streaming CoT) */}
          {showActiveThinking && (
            <TimelineRow
              icon={chainOfThought ? ChatBubbleThoughtIcon : null}
              spinner={!chainOfThought}
              isLast={!activeAction && !isDone}
            >
              {chainOfThought ? (
                <Markdown
                  content={chainOfThought}
                  isStreaming={false}
                  streamingState="streaming"
                  enableAnimation
                  animationDurationSeconds={0.3}
                  delimiter=" "
                  forcedTextSize="text-sm"
                  textColor="text-muted-foreground dark:text-muted-foreground-night"
                  isLastMessage={false}
                />
              ) : null}
            </TimelineRow>
          )}

          {/* Active action (tool in progress) */}
          {isActing && activeAction && (
            <TimelineRow spinner isLast={false}>
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {getActionOneLineLabel(activeAction, "running")}
              </span>
            </TimelineRow>
          )}

          {/* Pending spinner — shown when between transitions (not done, nothing active) */}
          {!isDone &&
            !showActiveThinking &&
            !activeAction &&
            !hasPendingToolCalls && <TimelineRow spinner isLast />}

          {/* Done marker */}
          {isDone && completedSteps.length > 0 && (
            <TimelineRow icon={CheckIcon} isLast>
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Done
              </span>
            </TimelineRow>
          )}
        </div>
      )}
    </div>
  );
}
