import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentStateClassification } from "@app/components/assistant/conversation/types";
import type {
  InlineActivityStep,
} from "@app/components/assistant/conversation/types";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { getInternalMCPServerIconByName } from "@app/lib/actions/mcp_internal_actions/constants";
import { getActionOneLineLabel } from "@app/lib/api/assistant/activity_steps";
import { formatDurationString } from "@app/lib/utils/timestamps";
import type {
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
} from "@app/types/assistant/conversation";
import { isLightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  AnimatedText,
  ChatBubbleThoughtIcon,
  CheckIcon,
  ChevronRightIcon,
  Icon,
  Markdown,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface InlineActivityStepsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  completedSteps: InlineActivityStep[];
}

function getCompletionLabel(
  status: LightAgentMessageType["status"],
  completionDurationMs: number
): string {
  switch (status) {
    case "failed":
      return `Errored after ${formatDurationString(completionDurationMs)}`;
    case "cancelled":
      return `Cancelled after ${formatDurationString(completionDurationMs)}`;
    default:
      return `Completed in ${formatDurationString(completionDurationMs)}`;
  }
}

function getCollapseAnimationStyle(isCollapsed: boolean): React.CSSProperties {
  return {
    gridTemplateRows: isCollapsed ? "0fr" : "1fr",
    opacity: isCollapsed ? 0 : 1,
    transition: isCollapsed
      ? "grid-template-rows 200ms ease-out"
      : "grid-template-rows 200ms ease-out, opacity 300ms",
  };
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
}: InlineActivityStepsProps) {
  const isAgentMessageWithActions =
    isLightAgentMessageWithActionsType(agentMessage);
  const actions = isAgentMessageWithActions ? agentMessage.actions : [];
  const chainOfThought = agentMessage.chainOfThought ?? "";

  const { openPanel } = useConversationSidePanelContext();

  const isDone =
    lastAgentStateClassification === "done" || agentMessage.status === "failed";

  const [isCollapsed, setIsCollapsed] = useState(isDone);

  useEffect(() => {
    if (isDone) {
      setIsCollapsed(true);
    }
  }, [isDone]);

  const openBreakdownPanel = () => {
    openPanel({
      type: "actions",
      messageId: agentMessage.sId,
    });
  };

  const isThinking = lastAgentStateClassification === "thinking";
  const isActing = lastAgentStateClassification === "acting";

  if (isDone && completedSteps.length === 0) {
    return null;
  }

  // Show active thinking whenever the agent is thinking.
  // Dedup in appendThinkingStep handles duplicate content at capture time.
  const showActiveThinking = isThinking;
  const activeAction =
    isActing && isAgentMessageWithActions ? actions[actions.length - 1] : null;

  const hasContent =
    completedSteps.length > 0 || showActiveThinking || activeAction;

  if (!hasContent) {
    return null;
  }

  return (
    <div className={`flex flex-col mt-2 text-sm ${isCollapsed ? "" : "gap-4"}`}>
      <button
        className="self-start text-muted-foreground dark:text-muted-foreground-night hover:text-foreground dark:hover:text-foreground-night transition-colors duration-200 flex gap-1 items-center"
        onClick={() => setIsCollapsed((c) => !c)}
      >
        <span
          className={`transition-transform duration-200 ease-out ${isCollapsed ? "" : "rotate-90"}`}
        >
          <Icon size="xs" visual={ChevronRightIcon} />
        </span>
        {agentMessage.completionDurationMs !== null ? (
          getCompletionLabel(agentMessage.status, agentMessage.completionDurationMs)
        ) : isDone ? (
          "Completed"
        ) : (
          <AnimatedText>Thinking...</AnimatedText>
        )}
      </button>

      <div
        className="grid ease-out"
        style={getCollapseAnimationStyle(isCollapsed)}
      >
        <div className="overflow-hidden">
          <div
            className="cursor-pointer flex flex-col gap-2 ml-4"
            onClick={openBreakdownPanel}
          >
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
                case "action": {
                  const actionIcon = step.action.internalMCPServerName
                    ? InternalActionIcons[
                        getInternalMCPServerIconByName(
                          step.action.internalMCPServerName
                        )
                      ]
                    : CheckIcon;

                  return (
                    <TimelineRow
                      key={step.id}
                      icon={actionIcon}
                      isLast={isLast}
                    >
                      <span className="text-muted-foreground dark:text-muted-foreground-night">
                        {getActionOneLineLabel(step.action)}
                      </span>
                    </TimelineRow>
                  );
                }
                default:
                  assertNever(step);
              }
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
                <span className="text-muted-foreground dark:text-muted-foreground-night">
                  {getActionOneLineLabel(activeAction, "running")}
                </span>
              </TimelineRow>
            )}

            {/* Pending spinner — shown when between transitions (not done, nothing active) */}
            {!isDone && !showActiveThinking && !activeAction && (
              <TimelineRow spinner isLast />
            )}
            {isDone && completedSteps.length > 0 && (
              <TimelineRow icon={CheckIcon} isLast>
                <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Done
                </span>
              </TimelineRow>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
