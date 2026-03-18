import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import {
  type CompletedStep,
  getActionOneLineLabel,
} from "@app/components/assistant/conversation/actions/inline/types";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentStateClassification } from "@app/components/assistant/conversation/types";
import { GENERATE_IMAGE_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
} from "@app/types/assistant/conversation";
import { isLightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import {
  Button,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  Icon,
  Markdown,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

interface InlineActivityStepsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
}

/**
 * Inline activity steps component.
 * Everything is wrapped in a single collapsible "Work" section
 * with a stepper timeline containing CoT, actions, and a "Done" marker.
 */
export function InlineActivitySteps({
  agentMessage,
  lastAgentStateClassification,
}: InlineActivityStepsProps) {
  const isAgentMessageWithActions =
    isLightAgentMessageWithActionsType(agentMessage);
  const actions = isAgentMessageWithActions ? agentMessage.actions : [];
  const chainOfThought = agentMessage.chainOfThought ?? "";

  const { openPanel } = useConversationSidePanelContext();

  // Accumulate completed steps based on state transitions.
  // - thinking → acting: capture CoT as completed thinking step
  // - acting → thinking: the action completed, capture it
  const [completedSteps, setCompletedSteps] = useState<CompletedStep[]>([]);
  const pendingCoTRef = useRef("");
  const prevAgentStateRef = useRef(lastAgentStateClassification);

  useEffect(() => {
    // Always capture the latest CoT so we have it when the state transitions.
    if (chainOfThought) {
      pendingCoTRef.current = chainOfThought;
    }

    const prev = prevAgentStateRef.current;
    prevAgentStateRef.current = lastAgentStateClassification;

    // thinking → acting: capture CoT immediately so it doesn't disappear.
    if (prev === "thinking" && lastAgentStateClassification === "acting") {
      if (pendingCoTRef.current) {
        const cotContent = pendingCoTRef.current;
        pendingCoTRef.current = "";
        setCompletedSteps((prev) => {
          const lastThinking = [...prev]
            .reverse()
            .find(
              (s): s is CompletedStep & { type: "thinking" } =>
                s.type === "thinking"
            );
          if (lastThinking && lastThinking.content === cotContent) {
            return prev;
          }
          return [
            ...prev,
            {
              type: "thinking",
              content: cotContent,
              id: `thinking-${Date.now()}`,
            },
          ];
        });
      }
    }

    // acting → thinking: the action just completed, capture it.
    if (prev === "acting" && lastAgentStateClassification === "thinking") {
      const lastAction = actions[actions.length - 1];
      if (
        lastAction &&
        !(
          lastAction.internalMCPServerName === "image_generation" &&
          lastAction.toolName === GENERATE_IMAGE_TOOL_NAME
        )
      ) {
        setCompletedSteps((prev) => {
          if (
            prev.some(
              (s) => s.type === "action" && s.action.id === lastAction.id
            )
          ) {
            return prev;
          }
          return [
            ...prev,
            {
              type: "action",
              action: lastAction,
              id: `action-${lastAction.id}`,
            },
          ];
        });
      }
    }
  }, [chainOfThought, lastAgentStateClassification, actions]);

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

  if (isDone && completedSteps.length === 0) {
    return null;
  }

  const hasCompletedActions = completedSteps.some((s) => s.type === "action");
  const showActiveThinking = isThinking && !hasCompletedActions;
  const activeAction =
    isActing && isAgentMessageWithActions ? actions[actions.length - 1] : null;

  const hasContent =
    completedSteps.length > 0 || showActiveThinking || activeAction;
  if (!hasContent) {
    return null;
  }

  return (
    <div className="flex flex-col">
      {/* Collapsible header */}
      <Button
        variant="ghost"
        size="xs"
        label="Work"
        icon={isCollapsed ? ChevronRightIcon : ChevronDownIcon}
        className="self-start text-muted-foreground dark:text-muted-foreground-night"
        onClick={() => setIsCollapsed((c) => !c)}
      />

      {/* Timeline content */}
      {!isCollapsed && (
        <div className="ml-5 mt-1">
          {completedSteps.map((step, index) => {
            const isLast =
              index === completedSteps.length - 1 &&
              !showActiveThinking &&
              !activeAction &&
              !isDone;

            switch (step.type) {
              case "thinking":
                return (
                  <TimelineRow key={step.id} icon={ClockIcon} isLast={isLast}>
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
                  <TimelineRow
                    key={step.id}
                    icon={CheckCircleIcon}
                    isLast={isLast}
                    onClick={openBreakdownPanel}
                  >
                    <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {getActionOneLineLabel(step.action)}
                    </span>
                    <Icon
                      visual={ChevronRightIcon}
                      size="xs"
                      className="flex-shrink-0 text-muted-foreground dark:text-muted-foreground-night"
                    />
                  </TimelineRow>
                );
            }
          })}

          {/* Active thinking (streaming CoT) */}
          {showActiveThinking && (
            <TimelineRow
              icon={chainOfThought ? ClockIcon : null}
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
            <TimelineRow spinner isLast={!isDone}>
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {getActionOneLineLabel(activeAction)}
              </span>
            </TimelineRow>
          )}

          {/* Done marker */}
          {isDone && completedSteps.length > 0 && (
            <TimelineRow icon={CheckCircleIcon} isLast>
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
