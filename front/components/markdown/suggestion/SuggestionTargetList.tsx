import type {
  AgentSuggestionTargetInput,
  SkillSuggestionTargetInput,
  SuggestionTarget,
} from "@app/components/markdown/suggestion/useSuggestionTarget";
import {
  useAgentSuggestionTarget,
  useSkillSuggestionTarget,
} from "@app/components/markdown/suggestion/useSuggestionTarget";
import { cn, LoadingBlock, Tooltip } from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import { Fragment } from "react";

function SuggestionTargetPill({
  name,
  visual,
  isDeletion,
  onOpen,
}: SuggestionTarget) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-6 min-w-0 items-center gap-1 font-medium"
    >
      {visual}
      <span className={cn("truncate", isDeletion && "line-through")}>
        {name}
      </span>
    </button>
  );
}

export function AgentTargetPill(input: AgentSuggestionTargetInput) {
  const { isLoading, target } = useAgentSuggestionTarget(input);

  if (isLoading) {
    return <LoadingBlock className="h-6 w-20" />;
  }

  return <SuggestionTargetPill {...target} />;
}

export function SkillTargetPill(input: SkillSuggestionTargetInput) {
  const { isLoading, target } = useSkillSuggestionTarget(input);

  if (isLoading) {
    return <LoadingBlock className="h-6 w-20" />;
  }

  return <SuggestionTargetPill {...target} />;
}

interface SuggestionTargetListProps {
  pills: ReactElement[];
}

export function SuggestionTargetList({ pills }: SuggestionTargetListProps) {
  const hiddenPills = pills.slice(2);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground">
      {pills.slice(0, 2).map((pill, index) => (
        <Fragment key={pill.key}>
          {index > 0 && (
            <svg
              width="4"
              height="4"
              viewBox="0 0 4 4"
              className="shrink-0 overflow-visible fill-primary-400"
            >
              <circle cx="2" cy="2" r="2" />
            </svg>
          )}
          {pill}
        </Fragment>
      ))}
      {hiddenPills.length > 0 && (
        <>
          <svg
            width="4"
            height="4"
            viewBox="0 0 4 4"
            className="shrink-0 overflow-visible fill-primary-400"
          >
            <circle cx="2" cy="2" r="2" />
          </svg>
          <Tooltip
            tooltipTriggerAsChild
            trigger={
              <span className="cursor-default text-muted-foreground [text-box:trim-both_cap_alphabetic]">
                +{hiddenPills.length}
              </span>
            }
            label={
              <div className="flex flex-col items-start">{hiddenPills}</div>
            }
          />
        </>
      )}
    </div>
  );
}
