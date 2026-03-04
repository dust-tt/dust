import {
  Avatar,
  CheckIcon,
  ChevronRightIcon,
  cn,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useRef, useState, useEffect } from "react";

export interface StepBreakdown {
  toolName: string;
  iconNode: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  inputs: string;
  output?: string;
}

export interface ThinkingStep {
  id: string;
  label: string;
  status: "done" | "active";
  updatedAt: number; // ms timestamp — used to rank recency
  breakdown?: StepBreakdown;
}

interface AgentThinkingStepsProps {
  steps: ThinkingStep[];
  agentName: string;
  agentAvatar: {
    emoji: string;
    backgroundColor: string;
  };
  onStepClick?: (stepId: string) => void;
  selectedStepId?: string | null;
}

const MAX_VISIBLE = 4;

export const AgentThinkingSteps = React.forwardRef<
  HTMLDivElement,
  AgentThinkingStepsProps
>(({ steps, agentName, agentAvatar, onStepClick, selectedStepId }, ref) => {
  // Track which step IDs were visible last render to detect new entrants
  const prevVisibleIds = useRef<Set<string>>(new Set());

  // Pick the MAX_VISIBLE most recently updated steps, display oldest-first
  // so newest activity always appears at the bottom.
  const visibleSteps = [...steps]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_VISIBLE)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newIds = visibleSteps
      .map((s) => s.id)
      .filter((id) => !prevVisibleIds.current.has(id));

    if (newIds.length > 0) {
      setAnimatingIds((prev) => new Set([...prev, ...newIds]));
      const t = setTimeout(() => {
        setAnimatingIds((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 350);
      return () => clearTimeout(t);
    }

    prevVisibleIds.current = new Set(visibleSteps.map((s) => s.id));
  }, [visibleSteps.map((s) => s.id + s.status).join(",")]);

  useEffect(() => {
    prevVisibleIds.current = new Set(visibleSteps.map((s) => s.id));
  });

  return (
    <div ref={ref} className="s-flex s-w-full s-flex-col s-gap-1">
      {/* Agent name row — mirrors message group header */}
      <div className="s-flex s-items-center s-gap-2 s-pl-0.5">
        <Avatar
          emoji={agentAvatar.emoji}
          backgroundColor={agentAvatar.backgroundColor}
          name={agentName}
          size="xs"
        />
        <span className="s-heading-sm s-text-foreground dark:s-text-foreground-night">
          @{agentName}
        </span>
      </div>

      {/* Thinking… + spinner */}
      <div className="s-ml-9 s-flex s-items-center s-gap-1.5">
        <span className="s-text-sm s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night">
          Thinking…
        </span>
        <Spinner size="xs" variant="dark" />
      </div>

      {/* Steps — top MAX_VISIBLE by recency, newest at bottom */}
      {visibleSteps.length > 0 && (
        <div className="s-ml-9 s-flex s-flex-col s-gap-0.5">
          {visibleSteps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              isNew={animatingIds.has(step.id)}
              isSelected={selectedStepId === step.id}
              onClick={
                step.breakdown ? () => onStepClick?.(step.id) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
});

AgentThinkingSteps.displayName = "AgentThinkingSteps";

const StepRow = React.forwardRef<
  HTMLDivElement,
  {
    step: ThinkingStep;
    isNew: boolean;
    isSelected: boolean;
    onClick?: () => void;
  }
>(({ step, isNew, isSelected, onClick }, ref) => {
  const isDone = step.status === "done";
  const isClickable = Boolean(onClick);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={cn(
        "s-flex s-items-center s-gap-1.5 s-rounded s-px-1 -s-mx-1",
        isNew && "s-animate-in s-fade-in s-slide-in-from-bottom-1 s-duration-300",
        isClickable && "s-cursor-pointer",
        isSelected && "s-bg-muted dark:s-bg-muted-night"
      )}
    >
      <Icon
        visual={isDone ? CheckIcon : ChevronRightIcon}
        size="xs"
        className={cn(
          isDone
            ? "s-text-faint dark:s-text-faint"
            : "s-text-muted-foreground dark:s-text-muted-foreground-night"
        )}
      />
      <span
        className={cn(
          "s-text-xs",
          isDone
            ? "s-text-faint dark:s-text-faint"
            : "s-text-muted-foreground dark:s-text-muted-foreground-night",
          
        )}
      >
        {step.label}
      </span>
    </div>
  );
});

StepRow.displayName = "StepRow";
