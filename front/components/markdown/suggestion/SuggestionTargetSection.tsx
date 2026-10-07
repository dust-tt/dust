import type { AgentActionCardSuggestionType } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { AgentSuggestionDetails } from "@app/components/markdown/suggestion/AgentSuggestionDetails";
import { isAgentActionCardSuggestion } from "@app/components/markdown/suggestion/suggestion_directives";
import {
  sortAgentSuggestionsByBuilderOrder,
  sortSkillSuggestionsByBuilderOrder,
} from "@app/components/markdown/suggestion/suggestion_order";
import {
  useAgentSuggestionTarget,
  useSkillSuggestionTarget,
} from "@app/components/markdown/suggestion/useSuggestionTarget";
import { PendingSkillSuggestionDetails } from "@app/components/skill_builder/SkillSuggestionCard";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ChevronDown,
  ChevronUp,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Icon,
  LinkExternal01,
  LoadingBlock,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import groupBy from "lodash/groupBy";
import type { ReactElement, ReactNode } from "react";
import { useCallback } from "react";

interface SuggestionTargetSectionProps {
  targetLabel: string;
  name: string;
  visual: ReactElement;
  onOpen: () => void;
  isDeletion?: boolean;
  children: ReactNode;
}

// One collapsible block per agent or skill, open by default. A deleted target has no detail to
// show: a chip flags it instead.
function SuggestionTargetSection({
  targetLabel,
  name,
  visual,
  onOpen,
  isDeletion = false,
  children,
}: SuggestionTargetSectionProps) {
  const { t } = useLingui();
  const header = (
    <div className="heading-sm flex min-w-0 items-center gap-1">
      <span className="shrink-0 text-foreground">{targetLabel}</span>
      <Button
        variant="outline"
        size="xs"
        isRounded
        icon={visual}
        label={name}
        iconRight={LinkExternal01}
        onClick={onOpen}
        className={cn("min-w-0", isDeletion && "line-through")}
      />
    </div>
  );

  if (isDeletion) {
    return (
      <div className="flex h-12 items-center justify-between gap-2 rounded-xl bg-background p-3">
        {header}
        <Chip size="xs" color="warning" label={t`Delete`} />
      </div>
    );
  }

  return (
    <Collapsible defaultOpen className="rounded-xl bg-background p-3">
      <div className="flex h-6 items-center justify-between gap-2">
        {header}
        <CollapsibleTrigger
          variant="secondary"
          hideChevron
          className="w-auto shrink-0 text-foreground"
        >
          <Icon
            visual={ChevronDown}
            size="sm"
            className="block group-data-[state=open]/col:hidden"
          />
          <Icon
            visual={ChevronUp}
            size="sm"
            className="hidden group-data-[state=open]/col:block"
          />
        </CollapsibleTrigger>
      </div>
      {/* Spacing lives on an inner element so the height animation stays smooth. */}
      <CollapsibleContent>
        <div className="flex flex-col gap-3 pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AgentSuggestionGroupProps {
  owner: LightWorkspaceType;
  label: string;
  suggestions: AgentActionCardSuggestionType[];
  agentConfiguration: AgentConfigurationType | null;
  pendingSkillNameById: Map<string, string>;
}

/** Suggestions of one kind, each a row, listed under a single heading. */
function AgentSuggestionGroup({
  owner,
  label,
  suggestions,
  agentConfiguration,
  pendingSkillNameById,
}: AgentSuggestionGroupProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="divide-y divide-border">
        {suggestions.map((suggestion) => (
          <AgentSuggestionDetails
            key={suggestion.sId}
            owner={owner}
            suggestion={suggestion}
            agentConfiguration={agentConfiguration}
            pendingSkillNameById={pendingSkillNameById}
          />
        ))}
      </div>
    </div>
  );
}

const GROUPED_AGENT_SUGGESTION_LABELS: Record<
  string,
  MessageDescriptor | undefined
> = {
  skills: msg`Skills`,
  tools: msg`Tools`,
  sub_agent: msg`Sub-agents`,
};

interface AgentSuggestionsDiffProps {
  owner: LightWorkspaceType;
  batchId: string;
  agentId: string;
  suggestions: AgentSuggestionType[];
  pendingSkillNameById: Map<string, string>;
}

export function AgentSuggestionsDiff({
  owner,
  batchId,
  agentId,
  suggestions,
  pendingSkillNameById,
}: AgentSuggestionsDiffProps) {
  const { t } = useLingui();
  const displayable = sortAgentSuggestionsByBuilderOrder(
    suggestions.filter(isAgentActionCardSuggestion)
  );
  // Each skill, tool and sub-agent is its own suggestion: they are listed together, under a
  // single heading per kind. Grouping keeps the sorted order of the kinds.
  const suggestionsByKind = groupBy(displayable, (s) => s.kind);
  const { agentConfiguration, isLoading, target } = useAgentSuggestionTarget({
    owner,
    batchId,
    agentId,
    suggestions,
  });

  if (isLoading) {
    return <LoadingBlock className="h-12 w-full" />;
  }

  return (
    <SuggestionTargetSection targetLabel={t`Agent`} {...target}>
      {Object.entries(suggestionsByKind).map(([kind, kindSuggestions]) => {
        const groupLabel = GROUPED_AGENT_SUGGESTION_LABELS[kind];
        return groupLabel ? (
          <AgentSuggestionGroup
            key={kind}
            owner={owner}
            label={t(groupLabel)}
            suggestions={kindSuggestions}
            agentConfiguration={agentConfiguration}
            pendingSkillNameById={pendingSkillNameById}
          />
        ) : (
          kindSuggestions.map((suggestion) => (
            <AgentSuggestionDetails
              key={suggestion.sId}
              owner={owner}
              suggestion={suggestion}
              agentConfiguration={agentConfiguration}
              pendingSkillNameById={pendingSkillNameById}
            />
          ))
        );
      })}
    </SuggestionTargetSection>
  );
}

interface SkillSuggestionsDiffProps {
  owner: LightWorkspaceType;
  batchId: string;
  skillId: string;
  suggestions: SkillSuggestionType[];
}

export function SkillSuggestionsDiff({
  owner,
  batchId,
  skillId,
  suggestions,
}: SkillSuggestionsDiffProps) {
  const { t } = useLingui();
  const { skill, isLoading, target } = useSkillSuggestionTarget({
    owner,
    batchId,
    skillId,
    suggestions,
  });

  const getSkillInstructionsHtml = useCallback(
    () => skill?.instructionsHtml ?? "",
    [skill]
  );
  const getCurrentAgentFacingDescription = useCallback(
    () => skill?.agentFacingDescription ?? "",
    [skill]
  );

  if (isLoading) {
    return <LoadingBlock className="h-12 w-full" />;
  }

  return (
    <SuggestionTargetSection targetLabel={t`Skill`} {...target}>
      {sortSkillSuggestionsByBuilderOrder(suggestions).map((suggestion) => (
        <PendingSkillSuggestionDetails
          key={suggestion.sId}
          suggestion={suggestion}
          getSkillInstructionsHtml={getSkillInstructionsHtml}
          getCurrentAgentFacingDescription={getCurrentAgentFacingDescription}
          workspaceId={owner.sId}
          layout="inline"
        />
      ))}
    </SuggestionTargetSection>
  );
}
