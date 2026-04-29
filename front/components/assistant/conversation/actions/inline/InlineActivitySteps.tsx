import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
import { ThinkingStep } from "@app/components/assistant/conversation/actions/inline/ThinkingStep";
import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  type AgentStateClassification,
  getPendingToolCallKey,
  type PendingToolCall,
} from "@app/components/assistant/conversation/types";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { getInternalMCPServerIconByName } from "@app/lib/actions/mcp_internal_actions/constants";
import { isToolExecutionStatusBlocked } from "@app/lib/actions/statuses";
import { getToolCallDisplayLabel } from "@app/lib/actions/tool_display_labels";
import { getActionOneLineLabel } from "@app/lib/api/assistant/activity_steps";
import { formatDurationString } from "@app/lib/utils/timestamps";
import type {
  InlineActivityStep,
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
} from "@app/types/assistant/conversation";
import { isLightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { WorkspaceType } from "@app/types/user";
import {
  AnimatedText,
  CheckIcon,
  ChevronRightIcon,
  cn,
  Icon,
  ToolsIcon,
  XCircleIcon,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

interface InlineActivityStepsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  completedSteps: InlineActivityStep[];
  pendingToolCalls: PendingToolCall[];
  onOpenDetails?: (messageId: string) => void;
  owner: WorkspaceType;
  isLastMessage: boolean;
}

function getCompletionLabel(
  status: LightAgentMessageType["status"],
  completionDurationMs: number
): string {
  switch (status) {
    case "failed":
      return `Errored after ${formatDurationString(Math.max(completionDurationMs, 0))}`;
    case "cancelled":
      return `Cancelled after ${formatDurationString(Math.max(completionDurationMs, 0))}`;
    default:
      return `Completed in ${formatDurationString(Math.max(completionDurationMs, 0))}`;
  }
}

function getTerminalLabel(status: LightAgentMessageType["status"]): string {
  switch (status) {
    case "cancelled":
      return "Cancelled";
    default:
      return "Completed";
  }
}

function getCollapseAnimationStyle(isCollapsed: boolean): React.CSSProperties {
  return {
    gridTemplateRows: isCollapsed ? "0fr" : "1fr",
    opacity: isCollapsed ? 0 : 1,
    transition: isCollapsed
      ? "grid-template-rows 280ms ease, opacity 280ms"
      : "grid-template-rows 200ms ease-in",
  };
}

/**
 * Inline activity steps component.
 * Everything is wrapped in a single collapsible "Work" section
 * with a stepper timeline containing CoT, actions, and a terminal marker.
 *
 * Steps are accumulated by useAgentMessageStream — this component is a pure render.
 */
export function InlineActivitySteps({
  agentMessage,
  lastAgentStateClassification,
  completedSteps,
  pendingToolCalls,
  onOpenDetails,
  owner,
  isLastMessage,
}: InlineActivityStepsProps) {
  const isAgentMessageWithActions =
    isLightAgentMessageWithActionsType(agentMessage);
  const actions = isAgentMessageWithActions ? agentMessage.actions : [];
  const chainOfThought = agentMessage.chainOfThought ?? "";

  const { openPanel } = useConversationSidePanelContext();

  const isDone =
    lastAgentStateClassification === "done" ||
    agentMessage.status === "failed" ||
    agentMessage.status === "cancelled";

  const [isCollapsed, setIsCollapsed] = useState(isDone && !isLastMessage);

  const openBreakdownPanel = (actionId?: string) => {
    if (onOpenDetails) {
      onOpenDetails(agentMessage.sId);
      return;
    }
    openPanel({
      type: "actions",
      messageId: agentMessage.sId,
      actionId,
    });
  };

  const isThinking = lastAgentStateClassification === "thinking";
  const isWriting = lastAgentStateClassification === "writing";
  const isActing = lastAgentStateClassification === "acting";
  const showPendingToolCalls = !isDone && pendingToolCalls.length > 0;

  const headerLabel =
    agentMessage.completionDurationMs !== null
      ? getCompletionLabel(
          agentMessage.status,
          agentMessage.completionDurationMs
        )
      : isDone
        ? getTerminalLabel(agentMessage.status)
        : null;

  // Writing-only: no prior steps, just streaming text. Show "Writing..."
  // without the collapse toggle so it doesn't look like a "Thinking" section.
  const isWritingOnly =
    isWriting && completedSteps.length === 0 && !showPendingToolCalls;

  const toggleCollapse = () => setIsCollapsed((c) => !c);

  // Done with no steps: show a static line — no toggle, not clickable.
  if (isDone && completedSteps.length === 0) {
    return (
      <div className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
        {headerLabel ? `${headerLabel}, without tools.` : "No tools used."}
      </div>
    );
  }

  // Show active thinking whenever the agent is thinking.
  // Dedup in appendThinkingStep handles duplicate content at capture time.
  const showActiveThinking = !isDone && isThinking;
  const showActiveWriting = !isDone && isWriting;
  const activePendingToolCalls = showPendingToolCalls ? pendingToolCalls : [];
  const completedActionIds = new Set(
    completedSteps.filter((s) => s.type === "action").map((s) => s.id)
  );
  const activeActions =
    !isDone && isActing && isAgentMessageWithActions
      ? actions.filter((a) => !completedActionIds.has(`action-${a.id}`))
      : [];
  const isStreamingWithoutContent =
    (showActiveThinking && !chainOfThought) ||
    (showActiveWriting && !agentMessage.content);
  const hasActiveSpinnerRow =
    activeActions.length > 0 || activePendingToolCalls.length > 0;
  // Only show the trailing loader when nothing else already renders one.
  const showTrailingLoader = isStreamingWithoutContent && !hasActiveSpinnerRow;

  const hasContent =
    completedSteps.length > 0 ||
    showActiveThinking ||
    showActiveWriting ||
    activeActions.length > 0 ||
    showPendingToolCalls;

  if (!hasContent) {
    return null;
  }

  const renderRunningToolRow = ({
    isLast,
    label,
    onClick,
  }: {
    isLast: boolean;
    label: string;
    onClick?: () => void;
  }) => {
    const row = (
      <TimelineRow spinner isLast={isLast}>
        <span className="text-muted-foreground dark:text-muted-foreground-night flex items-center gap-1">
          {label}
          <Icon
            size="xs"
            visual={ChevronRightIcon}
            className={cn("shrink-0", onClick ? "opacity-50" : "opacity-0")}
          />
        </span>
      </TimelineRow>
    );

    if (!onClick) {
      return row;
    }

    return (
      <div className="cursor-pointer" onClick={onClick}>
        {row}
      </div>
    );
  };

  return (
    <div className="flex flex-col text-sm">
      {isWritingOnly ? (
        <span className="self-start text-muted-foreground dark:text-muted-foreground-night flex gap-1 items-center">
          <AnimatedText>Writing…</AnimatedText>
        </span>
      ) : (
        <button
          className="self-start text-muted-foreground dark:text-muted-foreground-night hover:text-foreground dark:hover:text-foreground-night transition-colors duration-200 flex gap-1 items-center"
          onClick={toggleCollapse}
        >
          {headerLabel ?? <AnimatedText>Thinking…</AnimatedText>}
          <span
            className={cn(
              "transition-transform duration-200 ease-out",
              isCollapsed ? "rotate-0" : "rotate-90"
            )}
          >
            <Icon size="xs" visual={ChevronRightIcon} />
          </span>
        </button>
      )}

      <div
        className="grid ease-out"
        style={getCollapseAnimationStyle(isWritingOnly ? false : isCollapsed)}
      >
        <div className="overflow-hidden">
          <div className="mt-3 flex flex-col gap-3">
            {completedSteps.map((step, index) => {
              const isLast =
                index === completedSteps.length - 1 &&
                !showActiveThinking &&
                !showActiveWriting &&
                activeActions.length === 0 &&
                !isDone;

              switch (step.type) {
                case "thinking":
                  return (
                    <ThinkingStep
                      key={step.id}
                      content={step.content}
                      isStreaming={false}
                      isMessageDone={isDone}
                      isLast={isLast}
                    />
                  );
                case "content":
                  if (
                    !isString(step.content) ||
                    step.content.trim().length === 0
                  ) {
                    return null;
                  }
                  return (
                    <div key={step.id}>
                      <AgentMessageMarkdown
                        content={step.content}
                        owner={owner}
                        isLastMessage={false}
                      />
                    </div>
                  );
                case "action": {
                  const actionIcon = step.internalMCPServerName
                    ? InternalActionIcons[
                        getInternalMCPServerIconByName(
                          step.internalMCPServerName
                        )
                      ]
                    : ToolsIcon;

                  return (
                    <div
                      key={step.id}
                      className="cursor-pointer"
                      onClick={() => openBreakdownPanel(step.actionId)}
                    >
                      <TimelineRow icon={actionIcon} isLast={isLast}>
                        <span className="text-muted-foreground dark:text-muted-foreground-night flex items-center gap-1">
                          {step.label}
                          <Icon
                            size="xs"
                            visual={ChevronRightIcon}
                            className="shrink-0 opacity-50"
                          />
                        </span>
                      </TimelineRow>
                    </div>
                  );
                }
                default:
                  assertNever(step);
              }
            })}

            {/* Active thinking (streaming CoT) */}
            {showActiveThinking && chainOfThought && (
              <ThinkingStep
                content={chainOfThought}
                isStreaming
                isMessageDone={false}
                isLast={
                  activeActions.length === 0 &&
                  activePendingToolCalls.length === 0 &&
                  !showTrailingLoader &&
                  !isDone
                }
              />
            )}

            {/* Active writing (streaming content tokens) */}
            {showActiveWriting &&
            agentMessage.content &&
            completedSteps.length === 0 ? (
              <div>
                <AgentMessageMarkdown
                  content={agentMessage.content}
                  owner={owner}
                  streamingState="streaming"
                  isLastMessage={false}
                />
              </div>
            ) : null}

            {/* Active actions (tools in progress) — skip blocked actions, handled by BlockedAction */}
            {activeActions
              .filter((a) => !isToolExecutionStatusBlocked(a.status))
              .map((a) => (
                <React.Fragment key={`active-action-${a.id}`}>
                  {renderRunningToolRow({
                    isLast: false,
                    label: getActionOneLineLabel(a, "running"),
                    onClick: () => openBreakdownPanel(a.sId),
                  })}
                </React.Fragment>
              ))}

            {activePendingToolCalls.map((toolCall, index) => (
              <React.Fragment key={getPendingToolCallKey(toolCall, index)}>
                {renderRunningToolRow({
                  isLast:
                    index === activePendingToolCalls.length - 1 &&
                    !isDone &&
                    !showTrailingLoader,
                  label: getToolCallDisplayLabel(toolCall.toolName, "running"),
                })}
              </React.Fragment>
            ))}

            {showTrailingLoader && <TimelineRow spinner isLast={!isDone} />}

            {/* Pending spinner — shown when between transitions (not done, nothing active) */}
            {!isDone &&
              !showActiveThinking &&
              !showActiveWriting &&
              activeActions.length === 0 &&
              activePendingToolCalls.length === 0 && (
                <TimelineRow spinner isLast />
              )}
            {isDone &&
              completedSteps.length > 0 &&
              agentMessage.status !== "gracefully_stopped" && (
                <TimelineRow
                  icon={
                    agentMessage.status === "cancelled"
                      ? XCircleIcon
                      : CheckIcon
                  }
                  isLast
                >
                  <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {agentMessage.status === "cancelled" ? "Cancelled" : "Done"}
                  </span>
                </TimelineRow>
              )}
          </div>
        </div>
      </div>

      {showActiveWriting &&
      agentMessage.content &&
      completedSteps.length > 0 ? (
        <div className="mt-3">
          <AgentMessageMarkdown
            content={agentMessage.content}
            owner={owner}
            streamingState="streaming"
            isLastMessage={false}
          />
        </div>
      ) : null}
    </div>
  );
}
