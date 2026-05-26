import {
  getActionStepIcon,
  getCollapseAnimationStyle,
} from "@app/components/assistant/conversation/actions/inline/utils";
import { ThinkingStep } from "@app/components/assistant/conversation/actions/inline/ThinkingStep";
import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import type { PendingToolCall } from "@app/components/assistant/conversation/types";
import { getPendingToolCallKey } from "@app/components/assistant/conversation/types";
import { getToolCallDisplayLabel } from "@app/lib/actions/tool_display_labels";
import type { InlineActivityStep } from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  AnimatedText,
  CheckIcon,
  ChevronRightIcon,
  cn,
  Icon,
  XCircleIcon,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

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
  const [isCollapsed, setIsCollapsed] = useState(isDone);

  const hasContent =
    inlineActivitySteps.length > 0 ||
    pendingToolCalls.length > 0 ||
    activeCotContent.length > 0;

  if (!hasContent) {
    return null;
  }

  const showActiveCoT = !isDone && activeCotContent.length > 0;
  const showPendingToolCalls = !isDone && pendingToolCalls.length > 0;

  const toggleCollapse = () => setIsCollapsed((c) => !c);

  return (
    <div className="flex flex-col text-sm">
      <button
        className="self-start text-muted-foreground dark:text-muted-foreground-night hover:text-foreground dark:hover:text-foreground-night transition-colors duration-200 flex gap-1 items-center"
        onClick={toggleCollapse}
      >
        {isDone ? (
          isError ? (
            "Error"
          ) : (
            "Done"
          )
        ) : (
          <AnimatedText>Thinking…</AnimatedText>
        )}
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
            {inlineActivitySteps.map((step, index) => {
              const isLast =
                index === inlineActivitySteps.length - 1 &&
                !showActiveCoT &&
                !showPendingToolCalls &&
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
                  // Intermediate content steps are skipped — final response is shown separately.
                  return null;

                case "action": {
                  return (
                    <TimelineRow
                      key={step.id}
                      icon={getActionStepIcon(step)}
                      isLast={isLast}
                    >
                      <span className="text-muted-foreground dark:text-muted-foreground-night">
                        {step.label}
                      </span>
                    </TimelineRow>
                  );
                }

                default:
                  assertNeverAndIgnore(step);
                  return null;
              }
            })}

            {showActiveCoT && (
              <ThinkingStep
                content={activeCotContent}
                isStreaming
                isMessageDone={false}
                isLast={!showPendingToolCalls}
              />
            )}

            {showPendingToolCalls &&
              pendingToolCalls.map((toolCall, index) => (
                <React.Fragment key={getPendingToolCallKey(toolCall, index)}>
                  <TimelineRow
                    spinner
                    isLast={index === pendingToolCalls.length - 1}
                  >
                    <span className="text-muted-foreground dark:text-muted-foreground-night">
                      {getToolCallDisplayLabel(toolCall.toolName, "running")}
                    </span>
                  </TimelineRow>
                </React.Fragment>
              ))}

            {!isDone &&
              !showActiveCoT &&
              !showPendingToolCalls &&
              inlineActivitySteps.length > 0 && <TimelineRow spinner isLast />}

            {isDone && inlineActivitySteps.length > 0 && (
              <TimelineRow icon={isError ? XCircleIcon : CheckIcon} isLast>
                <span className="text-muted-foreground dark:text-muted-foreground-night">
                  {isError ? "Error" : "Done"}
                </span>
              </TimelineRow>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
