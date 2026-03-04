import {
  Avatar,
  Button,
  ChevronRightIcon,
  cn,
  Icon,
  Markdown,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { ThinkingStep } from "./AgentThinkingSteps";

interface AgentStepBreakdownPanelProps {
  steps: ThinkingStep[];
  onClose: () => void;
  focusedStepId?: string | null;
}

export function AgentStepBreakdownPanel({
  steps,
  onClose,
  focusedStepId,
}: AgentStepBreakdownPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Auto-expand the focused step whenever it changes
  useEffect(() => {
    if (!focusedStepId) return;
    setExpandedIds((prev) => new Set([...prev, focusedStepId]));
  }, [focusedStepId]);

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const completedSteps = steps.filter((s) => s.status === "done");

  // Count unique tool types for footer
  const toolNames = new Set(
    steps.map((s) => s.breakdown?.toolName).filter(Boolean)
  );
  const sourcesCount = [...toolNames].filter((t) =>
    (t ?? "").includes("search")
  ).length;
  const capabilitiesCount = [...toolNames].filter(
    (t) => !(t ?? "").includes("search")
  ).length;

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background dark:s-bg-background-night">
      {/* Header */}
      <div className="s-flex s-shrink-0 s-items-center s-justify-between s-border-b s-border-border s-px-4 s-py-3 dark:s-border-border-night">
        <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
          Message breakdown
        </span>
        <Button icon={XMarkIcon} variant="ghost" size="sm" onClick={onClose} />
      </div>

      {/* Timeline list */}
      <div className="s-flex-1 s-overflow-y-auto">
        {steps.length === 0 ? (
          <div className="s-flex s-items-center s-justify-center s-py-16">
            <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              No tools used yet.
            </span>
          </div>
        ) : (
          <div className="s-px-4 s-py-3">
            <div className="s-flex s-flex-col">
              {steps.map((step, i) => (
                <TimelineItem
                  key={step.id}
                  step={step}
                  expanded={expandedIds.has(step.id)}
                  onToggle={() => toggle(step.id)}
                  isFirst={i === 0}
                  isLast={i === steps.length - 1}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {completedSteps.length > 0 && (
        <div className="s-shrink-0 s-border-t s-border-border s-px-4 s-py-3 dark:s-border-border-night">
          <p className="s-mb-2 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
            The agent ran for {Math.round((steps.length * 700 + 600) / 1000)} sec
          </p>
          {capabilitiesCount > 0 && (
            <FooterRow label="Capabilities used" count={capabilitiesCount} />
          )}
          {sourcesCount > 0 && (
            <FooterRow label="Sources used" count={sourcesCount} />
          )}
        </div>
      )}
    </div>
  );
}

function TimelineItem({
  step,
  expanded,
  onToggle,
  isFirst,
  isLast,
}: {
  step: ThinkingStep;
  expanded: boolean;
  onToggle: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { breakdown, status } = step;
  const isDone = status === "done";
  const hasDetails = Boolean(breakdown);

  // The icon center is at py-2 top-padding (8px) + half icon height (14px) = 22px from top of item.
  // Line logic:
  //   first item : starts at icon center (top=22), goes to bottom of item
  //   middle item: full height (top=0 to bottom=0) — continuous connector
  //   last item  : goes from top of item (top=0) to icon center (height=22px)
  //   single item: no line
  const showLine = !(isFirst && isLast);
  // py-3 = 12px padding, icon height = 28px → center at 12 + 14 = 26px
  const iconCenter = 26;
  const lineTop = isFirst ? iconCenter : 0;
  const lineStyle: React.CSSProperties =
    isLast
      ? { left: 13, top: lineTop, height: iconCenter }
      : { left: 13, top: lineTop, bottom: 0 };

  return (
    <div className="s-relative s-py-3">
      {showLine && (
        <div
          className="s-absolute s-w-px s-bg-border dark:s-bg-border-night"
          style={lineStyle}
          aria-hidden
        />
      )}

      {/* Header row */}
      <div
        className={cn(
          "s-flex s-items-center s-gap-3",
          hasDetails && "s-cursor-pointer"
        )}
        onClick={hasDetails ? onToggle : undefined}
      >
        {/* Icon */}
        <div className={cn("s-relative s-z-10 s-shrink-0", !isDone && "s-opacity-50")}>
          {breakdown?.iconNode ?? (
            <Avatar size="xs" icon={ChevronRightIcon} />
          )}
        </div>

        {/* Text content */}
        <div className="s-flex s-min-w-0 s-flex-1 s-flex-col s-gap-0.5">
          <div className="s-flex s-items-center s-justify-between s-gap-2">
            <div className="s-flex s-min-w-0 s-items-center s-gap-1.5">
              <span
                className={cn(
                  "s-truncate s-text-sm s-font-semibold",
                  isDone
                    ? "s-text-foreground dark:s-text-foreground-night"
                    : "s-text-muted-foreground dark:s-text-muted-foreground-night"
                )}
              >
                {breakdown?.title ?? step.label}
              </span>
              {!isDone && <Spinner size="xs" variant="dark" />}
            </div>
            <div className="s-flex s-shrink-0 s-items-center s-gap-1.5">
              {breakdown?.badge && (
                <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                  {breakdown.badge}
                </span>
              )}
              {hasDetails && (
                <Icon
                  visual={ChevronRightIcon}
                  size="xs"
                  className={cn(
                    "s-text-muted-foreground s-transition-transform s-duration-200 dark:s-text-muted-foreground-night",
                    expanded && "s-rotate-90"
                  )}
                />
              )}
            </div>
          </div>
          {breakdown?.description && (
            <p className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night s-line-clamp-2">
              {breakdown.description}
            </p>
          )}
        </div>
      </div>

      {/* Animated expand/collapse via CSS grid-template-rows trick */}
      {breakdown && (
        <div
          className="s-overflow-hidden"
          style={{
            display: "grid",
            gridTemplateRows: expanded ? "1fr" : "0fr",
            transition: "grid-template-rows 250ms ease",
          }}
        >
          <div className="s-min-h-0">
            <div className="s-ml-10 s-mt-2 s-flex s-flex-col s-gap-3 s-pb-2">
              <ExpandedSection title="Inputs" content={breakdown.inputs} />
              {isDone && breakdown.output && (
                <ExpandedSection title="Output" content={breakdown.output} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandedSection({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <div className="s-flex s-flex-col s-gap-1">
      <span className="s-text-xs s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night">
        {title}
      </span>
      <div className="s-overflow-x-auto s-rounded-lg s-bg-muted s-p-3 dark:s-bg-muted-night">
        <Markdown content={content} isStreaming={false} forcedTextSize="xs" />
      </div>
    </div>
  );
}

function FooterRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="s-flex s-items-center s-justify-between s-rounded-lg s-px-0 s-py-1.5">
      <span className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
        {label}
      </span>
      <div className="s-flex s-items-center s-gap-1">
        <span className="s-flex s-h-5 s-w-5 s-items-center s-justify-center s-rounded-full s-bg-muted s-text-xs s-font-medium s-text-foreground dark:s-bg-muted-night dark:s-text-foreground-night">
          {count}
        </span>
        <Icon
          visual={ChevronRightIcon}
          size="xs"
          className="s-text-muted-foreground dark:s-text-muted-foreground-night"
        />
      </div>
    </div>
  );
}
