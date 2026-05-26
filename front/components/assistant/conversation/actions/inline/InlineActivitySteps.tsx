import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
import { ActivityTimeline } from "@app/components/assistant/conversation/actions/inline/ActivityTimeline";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  type AgentStateClassification,
  getPendingToolCallKey,
  type PendingToolCall,
} from "@app/components/assistant/conversation/types";
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
import type { WorkspaceType } from "@app/types/user";
import { AnimatedText, CheckIcon, XCircleIcon } from "@dust-tt/sparkle";

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

  const isWritingOnly =
    isWriting && completedSteps.length === 0 && !showPendingToolCalls;

  // Done with no steps: show a static line — no toggle, not clickable.
  if (isDone && completedSteps.length === 0) {
    return (
      <div className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
        {headerLabel ? `${headerLabel}, without tools.` : "No tools used."}
      </div>
    );
  }

  // Writing-only: no prior steps, just streaming text. Show "Writing..."
  // without the collapse toggle so it doesn't look like a "Thinking" section.
  if (isWritingOnly) {
    return (
      <div className="flex flex-col text-sm">
        <span className="self-start text-muted-foreground dark:text-muted-foreground-night flex gap-1 items-center">
          <AnimatedText>Writing…</AnimatedText>
        </span>
        {agentMessage.content && (
          <div className="mt-3">
            <AgentMessageMarkdown
              content={agentMessage.content}
              owner={owner}
              streamingState="streaming"
              isLastMessage={false}
            />
          </div>
        )}
      </div>
    );
  }

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

  const runningToolRows = [
    ...activeActions
      .filter((a) => !isToolExecutionStatusBlocked(a.status))
      .map((a) => ({
        key: `active-action-${a.id}`,
        label: getActionOneLineLabel(a, "running"),
        onClick: () => openBreakdownPanel(a.sId),
      })),
    ...activePendingToolCalls.map((tc, i) => ({
      key: getPendingToolCallKey(tc, i),
      label: getToolCallDisplayLabel(tc.toolName, "running"),
      onClick: undefined as (() => void) | undefined,
    })),
  ];

  const showTrailingSpinner =
    showTrailingLoader ||
    (!isDone &&
      !showActiveThinking &&
      !showActiveWriting &&
      activeActions.length === 0 &&
      activePendingToolCalls.length === 0 &&
      completedSteps.length > 0);

  const terminalRow =
    isDone &&
    completedSteps.length > 0 &&
    agentMessage.status !== "gracefully_stopped"
      ? {
          icon: agentMessage.status === "cancelled" ? XCircleIcon : CheckIcon,
          label: agentMessage.status === "cancelled" ? "Cancelled" : "Done",
        }
      : undefined;

  const extraBelowCollapse =
    showActiveWriting && agentMessage.content ? (
      <div className="mt-3">
        <AgentMessageMarkdown
          content={agentMessage.content}
          owner={owner}
          streamingState="streaming"
          isLastMessage={false}
        />
      </div>
    ) : undefined;

  return (
    <ActivityTimeline
      completedSteps={completedSteps}
      runningToolRows={runningToolRows}
      activeCotContent={showActiveThinking ? chainOfThought : ""}
      isDone={isDone}
      headerLabel={headerLabel ?? <AnimatedText>Thinking…</AnimatedText>}
      onActionClick={openBreakdownPanel}
      showTrailingSpinner={showTrailingSpinner}
      terminalRow={terminalRow}
      renderContentStep={(content) => (
        <AgentMessageMarkdown
          content={content}
          owner={owner}
          isLastMessage={false}
        />
      )}
      extraBelowCollapse={extraBelowCollapse}
    />
  );
}
