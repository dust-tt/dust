import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { getActionOneLineLabel } from "@app/components/assistant/conversation/actions/inline/types";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type {
  AgentStateClassification,
  InlineActivityStep,
} from "@app/components/assistant/conversation/types";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { getInternalMCPServerIconByName } from "@app/lib/actions/mcp_internal_actions/constants";
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
import { useEffect, useRef, useState } from "react";

interface InlineActivityStepsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  completedSteps: InlineActivityStep[];
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
    lastAgentStateClassification === "done" ||
    lastAgentStateClassification === "writing" ||
    agentMessage.status === "failed";

  const [isCollapsed, setIsCollapsed] = useState(isDone);
  const wasDoneRef = useRef(isDone);

  useEffect(() => {
    if (isDone && !wasDoneRef.current) {
      wasDoneRef.current = true;
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
  const showActiveThinking = isThinking;
  const activeAction =
    isActing && isAgentMessageWithActions ? actions[actions.length - 1] : null;

  const hasContent =
    completedSteps.length > 0 || showActiveThinking || activeAction;

  if (!hasContent) {
    return null;
  }

  return (
    <div className="flex flex-col mt-2 gap-4 text-xs">
      {/* Collapsible header */}
      <button
        className="self-start text-muted-foreground dark:text-muted-foreground-night hover:text-foreground dark:hover:text-foreground-night transition-colors duration-200 flex gap-1"
        onClick={() => setIsCollapsed((c) => !c)}
      >
        <span
          className={`transition-transform duration-200 ease-out ${isCollapsed ? "" : "rotate-90"}`}
        >
          <Icon size="xs" visual={ChevronRightIcon} />
        </span>
        {agentMessage.completionDurationMs !== null ? (
          `${agentMessage.status === "failed" ? "Errored after" : agentMessage.status === "cancelled" ? "Cancelled after" : "Completed in"} ${formatDurationString(agentMessage.completionDurationMs)}`
        ) : isDone ? (
          <AnimatedText>Writing...</AnimatedText>
        ) : (
          <AnimatedText>Thinking...</AnimatedText>
        )}
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
        style={{
          gridTemplateRows: isCollapsed ? "0fr" : "1fr",
          opacity: isCollapsed ? 0 : 1,
        }}
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
                !activeAction;

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
                        forcedTextSize="text-xs"
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
                isLast={!activeAction}
              >
                {chainOfThought ? (
                  <Markdown
                    content={chainOfThought}
                    isStreaming={false}
                    streamingState="streaming"
                    enableAnimation
                    animationDurationSeconds={0.3}
                    delimiter=" "
                    forcedTextSize="text-xs"
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
                <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
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
