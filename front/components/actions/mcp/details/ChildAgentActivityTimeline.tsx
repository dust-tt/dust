import { ActivityTimeline } from "@app/components/assistant/conversation/actions/inline/ActivityTimeline";
import type { PendingToolCall } from "@app/components/assistant/conversation/types";
import { getPendingToolCallKey } from "@app/components/assistant/conversation/types";
import { getToolCallDisplayLabel } from "@app/lib/actions/tool_display_labels";
import type { InlineActivityStep } from "@app/types/assistant/conversation";
import { AnimatedText, Check, XCircle } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface ChildAgentActivityTimelineProps {
  inlineActivitySteps: InlineActivityStep[];
  pendingToolCalls: PendingToolCall[];
  activeCotContent: string;
  isDone: boolean;
  isError: boolean;
}

export function ChildAgentActivityTimeline({
  inlineActivitySteps,
  pendingToolCalls,
  activeCotContent,
  isDone,
  isError,
}: ChildAgentActivityTimelineProps) {
  const { t } = useLingui();
  const hasContent =
    inlineActivitySteps.length > 0 ||
    pendingToolCalls.length > 0 ||
    activeCotContent.length > 0;

  if (!hasContent) {
    return null;
  }

  const showActiveCoT = !isDone && activeCotContent.length > 0;
  const showPendingToolCalls = !isDone && pendingToolCalls.length > 0;

  return (
    <ActivityTimeline
      completedSteps={inlineActivitySteps}
      runningToolRows={
        showPendingToolCalls
          ? pendingToolCalls.map((tc, i) => ({
              key: getPendingToolCallKey(tc, i),
              label: getToolCallDisplayLabel(tc.toolName, "running"),
            }))
          : []
      }
      activeCotContent={activeCotContent}
      isDone={isDone}
      source="run_agent_details"
      headerLabel={
        isDone ? (
          isError ? (
            t`Error`
          ) : (
            t`Done`
          )
        ) : (
          <AnimatedText>
            <Trans>Thinking…</Trans>
          </AnimatedText>
        )
      }
      showTrailingSpinner={
        !isDone &&
        !showActiveCoT &&
        !showPendingToolCalls &&
        inlineActivitySteps.length > 0
      }
      terminalRow={
        isDone && inlineActivitySteps.length > 0
          ? {
              icon: isError ? XCircle : Check,
              label: isError ? t`Error` : t`Done`,
            }
          : undefined
      }
    />
  );
}
