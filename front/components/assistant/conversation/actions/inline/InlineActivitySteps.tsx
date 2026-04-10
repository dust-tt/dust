import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
import { ThinkingStep } from "@app/components/assistant/conversation/actions/inline/ThinkingStep";
import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useSteerGroupCollapse } from "@app/components/assistant/conversation/SteerGroupCollapseContext";
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
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import {
  AnimatedText,
  CheckIcon,
  ChevronRightIcon,
  cn,
  Icon,
  ToolsIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface InlineActivityStepsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  completedSteps: InlineActivityStep[];
  pendingToolCalls: PendingToolCall[];
  onOpenDetails?: (messageId: string) => void;
  owner: WorkspaceType;
  steerGroupId?: string | null;
  groupDurationMs?: number | null;
  isGroupComplete?: boolean;
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

type StepSegment =
  | { type: "activity"; steps: InlineActivityStep[] }
  | { type: "content"; id: string; content: string };

/**
 * Group completed steps into alternating segments of activity (thinking/action)
 * and content. Content steps are rendered outside collapsible sections so they
 * remain visible when the activity timeline is collapsed.
 */
function groupStepsIntoSegments(steps: InlineActivityStep[]): StepSegment[] {
  const segments: StepSegment[] = [];
  for (const step of steps) {
    if (step.type === "content") {
      segments.push({ type: "content", id: step.id, content: step.content });
    } else {
      const lastSegment = segments[segments.length - 1];
      if (lastSegment && lastSegment.type === "activity") {
        lastSegment.steps.push(step);
      } else {
        segments.push({ type: "activity", steps: [step] });
      }
    }
  }
  return segments;
}

function CollapsibleSection({
  isCollapsed,
  children,
}: {
  isCollapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid ease-out"
      style={getCollapseAnimationStyle(isCollapsed)}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
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
  steerGroupId,
  groupDurationMs,
  isGroupComplete,
}: InlineActivityStepsProps) {
  const isAgentMessageWithActions =
    isLightAgentMessageWithActionsType(agentMessage);
  const actions = isAgentMessageWithActions ? agentMessage.actions : [];
  const chainOfThought = agentMessage.chainOfThought ?? "";

  const { openPanel } = useConversationSidePanelContext();

  const isDone =
    lastAgentStateClassification === "done" || agentMessage.status === "failed";

  // When part of a steer group, use shared collapse state (collapsed by default).
  // For standalone messages, collapse by default if already done (loading existing
  // conversation), expand if actively streaming.
  const groupCollapse = useSteerGroupCollapse(steerGroupId ?? null);
  const [localCollapsed, setLocalCollapsed] = useState(isDone);

  const segments = useMemo(
    () => groupStepsIntoSegments(completedSteps),
    [completedSteps]
  );

  const isCollapsed = groupCollapse
    ? groupCollapse.isCollapsed
    : localCollapsed;
  const toggleCollapsed = groupCollapse
    ? groupCollapse.toggle
    : () => setLocalCollapsed((c) => !c);

  // In a steer group, only the first message (the group root) shows the toggle header.
  // Other messages in the group just show their timeline content, controlled by the group.
  const isInGroup = !!steerGroupId;
  const isGroupRoot = steerGroupId === agentMessage.sId;
  const showHeader = !isInGroup || isGroupRoot;

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

  // For group roots, show completion label only when the entire group is done,
  // using the total group duration rather than this individual message's duration.
  const effectiveDurationMs = isGroupRoot
    ? (groupDurationMs ?? null)
    : agentMessage.completionDurationMs;
  const effectiveIsDone = isGroupRoot ? !!isGroupComplete : isDone;

  const headerLabel = effectiveIsDone
    ? effectiveDurationMs !== null
      ? getCompletionLabel(agentMessage.status, effectiveDurationMs)
      : "Completed"
    : null;

  const toggleCollapse = toggleCollapsed;

  // Done with no steps: show a static line — no toggle, not clickable.
  // Skip for non-root group members (their header is handled by the root).
  if (isDone && completedSteps.length === 0 && showHeader) {
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

  const renderActivityStep = (
    step: InlineActivityStep,
    isLast: boolean
  ): React.ReactNode => {
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
      case "action": {
        const actionIcon = step.internalMCPServerName
          ? InternalActionIcons[
              getInternalMCPServerIconByName(step.internalMCPServerName)
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
      case "content":
        // Content steps are rendered outside collapsible sections.
        return null;
      default:
        return assertNever(step);
    }
  };

  // Whether the last completed step is followed by more activity.
  const hasActivityAfterCompletedSteps =
    showActiveThinking ||
    showActiveWriting ||
    !!activeAction ||
    !!latestPendingToolCall ||
    isDone;

  // Trailing active states (streaming thinking, running tools, done marker).
  const trailingActivityContent = (
    <div className="flex flex-col gap-3">
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
  );

  const hasTrailingActivity =
    showActiveThinking ||
    showActiveWriting ||
    activeAction ||
    !!latestPendingToolCall ||
    showTrailingLoader ||
    (!isDone &&
      !showActiveThinking &&
      !showActiveWriting &&
      !activeAction &&
      !latestPendingToolCall) ||
    (isDone &&
      completedSteps.length > 0 &&
      agentMessage.status !== "gracefully_stopped");

  // Renders segments with content steps always visible and activity steps collapsible.
  const renderSegmentedContent = (
    <>
      {segments.map((segment, segmentIndex) => {
        if (segment.type === "content") {
          if (segment.content.trim().length === 0) {
            return null;
          }
          return (
            <div key={segment.id}>
              <AgentMessageMarkdown
                content={segment.content}
                owner={owner}
                isStreaming={false}
                isLastMessage={false}
              />
            </div>
          );
        }

        // Activity segment: collapsible group of thinking/action steps.
        const isLastSegment = segmentIndex === segments.length - 1;
        return (
          <CollapsibleSection
            key={segment.steps[0].id}
            isCollapsed={isCollapsed}
          >
            <div className="flex flex-col gap-3">
              {segment.steps.map((step, stepIndex) => {
                const isLastStep =
                  isLastSegment &&
                  stepIndex === segment.steps.length - 1 &&
                  !hasActivityAfterCompletedSteps;
                return renderActivityStep(step, isLastStep);
              })}
            </div>
          </CollapsibleSection>
        );
      })}

      {hasTrailingActivity && (
        <CollapsibleSection isCollapsed={isCollapsed}>
          {trailingActivityContent}
        </CollapsibleSection>
      )}
    </>
  );

  // Non-root group members: show segmented content without the header toggle.
  if (isInGroup && !isGroupRoot) {
    return (
      <div className="mt-3 flex flex-col gap-3 text-sm">
        {renderSegmentedContent}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {showHeader && (
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

      {renderSegmentedContent}

      {/* Active writing (streaming content tokens) — outside collapsible area
          so it stays visible when the activity timeline is collapsed. */}
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
    </div>
  );
}
