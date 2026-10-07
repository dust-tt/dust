import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
import { ActivityTimeline } from "@app/components/assistant/conversation/actions/inline/ActivityTimeline";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type {
  AgentStateClassification,
  PendingToolCall,
} from "@app/components/assistant/conversation/types";
import { getPendingToolCallKey } from "@app/components/assistant/conversation/types";
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
import { AnimatedText, Check, XCircle } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

interface InlineActivityStepsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  completedSteps: InlineActivityStep[];
  pendingToolCalls: PendingToolCall[];
  onOpenDetails?: (messageId: string, actionId?: string) => void;
  owner: WorkspaceType;
  conversationId: string;
  isLastMessage: boolean;
}

function getCompletionLabel(
  status: LightAgentMessageType["status"],
  completionDurationMs: number,
  withoutTools: boolean
): MessageDescriptor {
  const duration = formatDurationString(Math.max(completionDurationMs, 0));
  switch (status) {
    case "failed":
      return withoutTools
        ? msg`Errored after ${duration}, without tools.`
        : msg`Errored after ${duration}`;
    case "cancelled":
      return withoutTools
        ? msg`Cancelled after ${duration}, without tools.`
        : msg`Cancelled after ${duration}`;
    default:
      return withoutTools
        ? msg`Completed in ${duration}, without tools.`
        : msg`Completed in ${duration}`;
  }
}

function getTerminalLabel(
  status: LightAgentMessageType["status"],
  withoutTools: boolean
): MessageDescriptor {
  switch (status) {
    case "cancelled":
      return withoutTools ? msg`Cancelled, without tools.` : msg`Cancelled`;
    default:
      return withoutTools ? msg`Completed, without tools.` : msg`Completed`;
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
  conversationId,
}: InlineActivityStepsProps) {
  const { t } = useLingui();
  const isAgentMessageWithActions =
    isLightAgentMessageWithActionsType(agentMessage);
  const actions = isAgentMessageWithActions ? agentMessage.actions : [];
  const chainOfThought = agentMessage.chainOfThought ?? "";

  const { togglePanel } = useConversationSidePanelContext();

  const isDone =
    lastAgentStateClassification === "done" ||
    agentMessage.status === "failed" ||
    agentMessage.status === "cancelled";

  const openBreakdownPanel = (actionId?: string) => {
    if (onOpenDetails) {
      onOpenDetails(agentMessage.sId, actionId);
      return;
    }
    togglePanel({
      type: "actions",
      messageId: agentMessage.sId,
      actionId,
    });
  };

  const isThinking =
    lastAgentStateClassification === "placeholder" ||
    lastAgentStateClassification === "thinking";
  const isWriting = lastAgentStateClassification === "writing";
  const isActing = lastAgentStateClassification === "acting";
  const showPendingToolCalls = !isDone && pendingToolCalls.length > 0;

  const getHeaderLabel = (withoutTools: boolean) =>
    agentMessage.completionDurationMs !== null
      ? t(
          getCompletionLabel(
            agentMessage.status,
            agentMessage.completionDurationMs,
            withoutTools
          )
        )
      : isDone
        ? t(getTerminalLabel(agentMessage.status, withoutTools))
        : null;
  const headerLabel = getHeaderLabel(false);

  const isWritingOnly =
    isWriting && completedSteps.length === 0 && !showPendingToolCalls;

  // Done with no steps: show a static line — no toggle, not clickable.
  if (isDone && completedSteps.length === 0) {
    return (
      <div className="mt-2 text-sm text-muted-foreground">
        {getHeaderLabel(true) ?? <Trans>No tools used.</Trans>}
      </div>
    );
  }

  // Writing-only: no prior steps, just streaming text. Show "Writing..."
  // without the collapse toggle so it doesn't look like a "Thinking" section.
  if (isWritingOnly) {
    return (
      <div className="flex flex-col text-sm">
        <span className="self-start text-muted-foreground flex gap-1 items-center">
          <AnimatedText>
            <Trans>Writing…</Trans>
          </AnimatedText>
        </span>
        {agentMessage.content && (
          // Streaming answer text: same font as the final answer (not the
          // chain of thought rendered by renderContentStep below).
          <div className="mt-3 font-conversation">
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
          icon: agentMessage.status === "cancelled" ? XCircle : Check,
          label:
            agentMessage.status === "cancelled"
              ? t`Cancelled`
              : t({ message: "Done", context: "activity status" }),
        }
      : undefined;

  const extraBelowCollapse =
    !isDone && agentMessage.content ? (
      <div className="mt-3 font-conversation">
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
      headerLabel={
        headerLabel ?? (
          <AnimatedText>
            <Trans>Thinking…</Trans>
          </AnimatedText>
        )
      }
      source="message"
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
