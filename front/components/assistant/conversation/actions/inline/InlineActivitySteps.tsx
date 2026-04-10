import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
import { ThinkingStep } from "@app/components/assistant/conversation/actions/inline/ThinkingStep";
import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type {
  AgentStateClassification,
  PendingToolCall,
} from "@app/components/assistant/conversation/types";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { getInternalMCPServerIconByName } from "@app/lib/actions/mcp_internal_actions/constants";
import { getToolCallDisplayLabel } from "@app/lib/actions/tool_display_labels";
import { getActionOneLineLabel } from "@app/lib/api/assistant/activity_steps";
import { formatDurationString } from "@app/lib/utils/timestamps";
import type {
  InlineActivityStep,
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
} from "@app/types/assistant/conversation";
import { isLightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { WorkspaceType } from "@app/types/user";
import {
  AnimatedText,
  CheckIcon,
  ChevronRightIcon,
  cn,
  Icon,
  ToolsIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface InlineActivityStepsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  completedSteps: InlineActivityStep[];
  pendingToolCalls: PendingToolCall[];
  onOpenDetails?: (messageId: string) => void;
  owner: WorkspaceType;
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
 * with a stepper timeline containing CoT, actions, and a "Done" marker.
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
}: InlineActivityStepsProps) {
  const isAgentMessageWithActions =
    isLightAgentMessageWithActionsType(agentMessage);
  const actions = isAgentMessageWithActions ? agentMessage.actions : [];
  const chainOfThought = agentMessage.chainOfThought ?? "";

  const { openPanel } = useConversationSidePanelContext();

  const isDone =
    lastAgentStateClassification === "done" || agentMessage.status === "failed";

  const [isCollapsed, setIsCollapsed] = useState(false);

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
  const showPendingToolCalls = pendingToolCalls.length > 0;

  const headerLabel =
    agentMessage.completionDurationMs !== null
      ? getCompletionLabel(
          agentMessage.status,
          agentMessage.completionDurationMs
        )
      : isDone
        ? "Completed"
        : null;

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
  const showActiveThinking = isThinking;
  const showActiveWriting = isWriting;
  const latestPendingToolCall = showPendingToolCalls
    ? pendingToolCalls[pendingToolCalls.length - 1]
    : null;
  const showTrailingLoader =
    (showActiveThinking && !chainOfThought) ||
    (showActiveWriting && !agentMessage.content);
  const activeAction =
    isActing && isAgentMessageWithActions ? actions[actions.length - 1] : null;

  const hasContent =
    completedSteps.length > 0 ||
    showActiveThinking ||
    showActiveWriting ||
    activeAction ||
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

      <div
        className="grid ease-out"
        style={getCollapseAnimationStyle(isCollapsed)}
      >
        <div className="overflow-hidden">
          <div className="mt-3 flex flex-col gap-3">
            {completedSteps.map((step, index) => {
              const isLast =
                index === completedSteps.length - 1 &&
                !showActiveThinking &&
                !showActiveWriting &&
                !activeAction &&
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
                        isStreaming={false}
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
                  assertNeverAndIgnore(step);
              }
            })}

            {/* Active thinking (streaming CoT) */}
            {showActiveThinking && chainOfThought && (
              <ThinkingStep
                content={chainOfThought}
                isStreaming
                isMessageDone={false}
                isLast={
                  !activeAction &&
                  !latestPendingToolCall &&
                  !showTrailingLoader &&
                  !isDone
                }
              />
            )}

            {/* Active writing (streaming content tokens) */}
            {showActiveWriting && agentMessage.content ? (
              <div>
                <AgentMessageMarkdown
                  content={agentMessage.content}
                  owner={owner}
                  isStreaming={false}
                  streamingState="streaming"
                  isLastMessage={false}
                />
              </div>
            ) : null}

            {/* Active action (tool in progress) */}
            {isActing &&
              activeAction &&
              renderRunningToolRow({
                isLast: false,
                label: getActionOneLineLabel(activeAction, "running"),
                onClick: () => openBreakdownPanel(activeAction.sId),
              })}

            {latestPendingToolCall &&
              renderRunningToolRow({
                isLast: !isDone && !showTrailingLoader,
                label: getToolCallDisplayLabel(
                  latestPendingToolCall.toolName,
                  "running"
                ),
              })}

            {showTrailingLoader && <TimelineRow spinner isLast={!isDone} />}

            {/* Pending spinner — shown when between transitions (not done, nothing active) */}
            {!isDone &&
              !showActiveThinking &&
              !showActiveWriting &&
              !activeAction &&
              !latestPendingToolCall && <TimelineRow spinner isLast />}
            {isDone &&
              completedSteps.length > 0 &&
              agentMessage.status !== "gracefully_stopped" && (
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
