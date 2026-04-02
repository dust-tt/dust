import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentStateClassification } from "@app/components/assistant/conversation/types";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { getInternalMCPServerIconByName } from "@app/lib/actions/mcp_internal_actions/constants";
import { getActionOneLineLabel } from "@app/lib/api/assistant/activity_steps";
import { formatDurationString } from "@app/lib/utils/timestamps";
import type {
  InlineActivityStep,
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
} from "@app/types/assistant/conversation";
import { isLightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  AnimatedText,
  ChevronRightIcon,
  cn,
  Icon,
  Markdown,
  Spinner,
  ToolsIcon,
  TruncatedContent,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface InlineActivityStepsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  completedSteps: InlineActivityStep[];
  onOpenDetails?: (messageId: string) => void;
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
  onOpenDetails,
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
  const isActing = lastAgentStateClassification === "acting";

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
  const activeAction =
    isActing && isAgentMessageWithActions ? actions[actions.length - 1] : null;

  const hasContent =
    completedSteps.length > 0 || showActiveThinking || activeAction;

  if (!hasContent) {
    return null;
  }

  return (
    <div className={`flex flex-col ${isCollapsed ? "" : "gap-4"}`}>
      <button
        className="self-start text-muted-foreground dark:text-muted-foreground-night hover:text-foreground dark:hover:text-foreground-night transition-colors duration-200 flex gap-1 items-center"
        onClick={toggleCollapse}
      >
        {headerLabel ?? <AnimatedText>Activity</AnimatedText>}
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
          <div className="flex flex-col gap-4">
            {completedSteps.map((step) => {
              switch (step.type) {
                case "thinking":
                  return (
                    <div key={step.id}>
                      <TruncatedContent
                        thresholdPx={220}
                        collapsedHeightPx={180}
                        animated
                        expandLabel="Show more"
                        collapseLabel="Hide"
                        buttonVariant="ghost-secondary"
                      >
                        <Markdown
                          content={step.content}
                          isStreaming={false}
                          isLastMessage={false}
                        />
                      </TruncatedContent>
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
                      className="flex cursor-pointer items-center gap-2"
                      onClick={() => openBreakdownPanel(step.actionId)}
                    >
                      <Icon
                        visual={actionIcon}
                        size="xs"
                        className="shrink-0 text-muted-foreground dark:text-muted-foreground-night"
                      />
                      <span className="text-muted-foreground dark:text-muted-foreground-night flex items-center gap-1">
                        {step.label}
                        <Icon
                          size="xs"
                          visual={ChevronRightIcon}
                          className="shrink-0 opacity-50"
                        />
                      </span>
                    </div>
                  );
                }
                case "content":
                  return (
                    <div key={step.id}>
                      <Markdown
                        content={step.content}
                        isStreaming={false}
                        isLastMessage={false}
                      />
                    </div>
                  );
                default:
                  assertNever(step);
              }
            })}

            {/* Active thinking (streaming CoT) */}
            {showActiveThinking &&
              (chainOfThought ? (
                <div>
                  <Markdown
                    content={chainOfThought}
                    isStreaming={false}
                    streamingState="streaming"
                    enableAnimation
                    animationDurationSeconds={0.3}
                    delimiter=" "
                    isLastMessage={false}
                  />
                </div>
              ) : (
                <Spinner size="xs" />
              ))}

            {/* Active action (tool in progress) */}
            {isActing && activeAction && (
              <div className="flex items-center gap-2">
                <div className="shrink-0">
                  <Spinner size="xs" />
                </div>
                <span className="text-muted-foreground dark:text-muted-foreground-night">
                  {getActionOneLineLabel(activeAction, "running")}
                </span>
              </div>
            )}

            {/* Pending spinner — shown when between transitions (not done, nothing active) */}
            {!isDone && !showActiveThinking && !activeAction && (
              <Spinner size="xs" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
