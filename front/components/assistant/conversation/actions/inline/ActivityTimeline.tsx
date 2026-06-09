import { ThinkingStep } from "@app/components/assistant/conversation/actions/inline/ThinkingStep";
import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import {
  getActionStepIcon,
  getCollapseAnimationStyle,
} from "@app/components/assistant/conversation/actions/inline/utils";
import type { InlineActivityStep } from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ChevronRight, cn, Icon } from "@dust-tt/sparkle";
import React, { useState } from "react";

interface RunningToolRow {
  key: string;
  label: string;
  onClick?: () => void;
}

export interface ActivityTimelineProps {
  completedSteps: InlineActivityStep[];
  runningToolRows: RunningToolRow[];
  activeCotContent: string;
  isDone: boolean;
  headerLabel: React.ReactNode;
  onActionClick?: (actionId: string | undefined) => void;
  showTrailingSpinner: boolean;
  terminalRow?: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  };
  renderContentStep?: (content: string) => React.ReactNode;
  extraBelowCollapse?: React.ReactNode;
}

export function ActivityTimeline({
  completedSteps,
  runningToolRows,
  activeCotContent,
  isDone,
  headerLabel,
  onActionClick,
  showTrailingSpinner,
  terminalRow,
  renderContentStep,
  extraBelowCollapse,
}: ActivityTimelineProps) {
  const [isCollapsed, setIsCollapsed] = useState(isDone);

  const showActiveCoT = !isDone && activeCotContent.length > 0;
  const hasRunningRows = runningToolRows.length > 0;

  const toggleCollapse = () => setIsCollapsed((c) => !c);

  return (
    <div className="flex flex-col text-sm">
      <button
        className="self-start text-muted-foreground dark:text-muted-foreground-night hover:text-foreground dark:hover:text-foreground-night transition-colors duration-200 flex gap-1 items-center"
        onClick={toggleCollapse}
      >
        {headerLabel}
        <span
          className={cn(
            "transition-transform duration-200 ease-out",
            isCollapsed ? "rotate-0" : "rotate-90"
          )}
        >
          <Icon size="xs" visual={ChevronRight} />
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
                !showActiveCoT &&
                !hasRunningRows &&
                !showTrailingSpinner &&
                !terminalRow;

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
                  return renderContentStep && step.content?.trim() ? (
                    <div key={step.id}>{renderContentStep(step.content)}</div>
                  ) : null;
                case "action": {
                  const row = (
                    <TimelineRow icon={getActionStepIcon(step)} isLast={isLast}>
                      <span className="text-muted-foreground dark:text-muted-foreground-night flex items-center gap-1">
                        {step.label}
                        <Icon
                          size="xs"
                          visual={ChevronRight}
                          className={cn(
                            "shrink-0",
                            onActionClick ? "opacity-50" : "opacity-0"
                          )}
                        />
                      </span>
                    </TimelineRow>
                  );
                  if (!onActionClick) {
                    return <React.Fragment key={step.id}>{row}</React.Fragment>;
                  }
                  return (
                    <div
                      key={step.id}
                      className="cursor-pointer"
                      onClick={() => onActionClick(step.actionId)}
                    >
                      {row}
                    </div>
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
                isLast={!hasRunningRows && !showTrailingSpinner}
              />
            )}

            {runningToolRows.map((row, index) => {
              const isLast =
                index === runningToolRows.length - 1 && !showTrailingSpinner;
              const rowEl = (
                <TimelineRow spinner isLast={isLast}>
                  <span className="text-muted-foreground dark:text-muted-foreground-night flex items-center gap-1">
                    {row.label}
                    <Icon
                      size="xs"
                      visual={ChevronRight}
                      className={cn(
                        "shrink-0",
                        row.onClick ? "opacity-50" : "opacity-0"
                      )}
                    />
                  </span>
                </TimelineRow>
              );
              return row.onClick ? (
                <div
                  key={row.key}
                  className="cursor-pointer"
                  onClick={row.onClick}
                >
                  {rowEl}
                </div>
              ) : (
                <React.Fragment key={row.key}>{rowEl}</React.Fragment>
              );
            })}

            {showTrailingSpinner && <TimelineRow spinner isLast />}

            {terminalRow && (
              <TimelineRow icon={terminalRow.icon} isLast>
                <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {terminalRow.label}
                </span>
              </TimelineRow>
            )}
          </div>
        </div>
      </div>

      {extraBelowCollapse}
    </div>
  );
}
