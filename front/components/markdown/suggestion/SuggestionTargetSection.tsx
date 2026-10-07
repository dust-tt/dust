import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentActionCardSuggestionType } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { AgentSuggestionDetails } from "@app/components/markdown/suggestion/AgentSuggestionDetails";
import {
  DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS,
  isAgentActionCardSuggestion,
} from "@app/components/markdown/suggestion/suggestion_directives";
import {
  sortAgentSuggestionsByBuilderOrder,
  sortSkillSuggestionsByBuilderOrder,
} from "@app/components/markdown/suggestion/suggestion_order";
import { trackSuggestionTargetPreviewOpen } from "@app/components/markdown/suggestion/suggestionTracking";
import { getIcon } from "@app/components/resources/resources_icons";
import { PendingSkillSuggestionDetails } from "@app/components/skill_builder/SkillSuggestionCard";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import {
  AGENT_SIDE_PANEL_TYPE,
  SKILL_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import {
  isCreateSkillSuggestion,
  isDeleteSkillSuggestion,
} from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
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
import { useCallback, useMemo } from "react";

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
  const { openPanel } = useConversationSidePanelContext();
  const displayable = sortAgentSuggestionsByBuilderOrder(
    suggestions.filter(isAgentActionCardSuggestion)
  );
  // Each skill, tool and sub-agent is its own suggestion: they are listed together, under a
  // single heading per kind. Grouping keeps the sorted order of the kinds.
  const suggestionsByKind = groupBy(displayable, (s) => s.kind);
  const { agentConfiguration, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agentId,
      disabled: displayable.some((s) =>
        DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS.includes(s.kind)
      ),
    });

  if (isAgentConfigurationLoading) {
    return <LoadingBlock className="h-12 w-full" />;
  }

  // A created agent is a pending placeholder: its name is the suggested one.
  const creation = displayable.find((s) => s.kind === "create");
  const isDeletion = displayable.some((s) => s.kind === "delete");
  const name =
    creation?.kind === "create"
      ? creation.suggestion.name
      : (agentConfiguration?.name ?? t`Agent`);

  return (
    <SuggestionTargetSection
      targetLabel={t`Agent`}
      name={name}
      visual={
        agentConfiguration && !creation ? (
          <Avatar visual={agentConfiguration.pictureUrl} size="3xs" />
        ) : (
          <Avatar icon={getIcon("ActionRobotIcon")} size="3xs" />
        )
      }
      onOpen={() => {
        trackSuggestionTargetPreviewOpen({
          batchId,
          targetKind: "agent",
          targetId: agentId,
        });
        openPanel({
          type: AGENT_SIDE_PANEL_TYPE,
          agentId,
          previewBatchId: batchId,
        });
      }}
      isDeletion={isDeletion}
    >
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
  const { openPanel } = useConversationSidePanelContext();
  // A created skill is a pending placeholder: its name is the suggested one.
  const creation = suggestions.find(isCreateSkillSuggestion);
  const isDeletion = suggestions.some(isDeleteSkillSuggestion);
  const { skill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId,
    disabled: !!creation,
  });

  const getSkillInstructionsHtml = useCallback(
    () => skill?.instructionsHtml ?? "",
    [skill]
  );
  const getCurrentAgentFacingDescription = useCallback(
    () => skill?.agentFacingDescription ?? "",
    [skill]
  );
  const SkillAvatar = useMemo(() => getSkillAvatarIcon(skill), [skill]);

  if (isSkillLoading) {
    return <LoadingBlock className="h-12 w-full" />;
  }

  return (
    <SuggestionTargetSection
      targetLabel={t`Skill`}
      name={creation ? creation.suggestion.name : (skill?.name ?? t`Skill`)}
      visual={<SkillAvatar size="3xs" />}
      onOpen={() => {
        trackSuggestionTargetPreviewOpen({
          batchId,
          targetKind: "skill",
          targetId: skillId,
        });
        openPanel({
          type: SKILL_SIDE_PANEL_TYPE,
          skillId,
          previewBatchId: batchId,
        });
      }}
      isDeletion={isDeletion}
    >
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
