/**
 * Markdown directive plugin for batches of conversational suggestions.
 *
 * `suggest` (building_agents_and_skills MCP) records its suggestions in one batch and emits
 * `:batch_edit[]{sId=xxx}`. The directive carries the batch id only: the card below resolves the
 * batch, and the agents and skills its suggestions target, through their SWR hooks. A batch is
 * accepted or rejected as a whole.
 */

import {
  parseSuggestionPreviewData,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentActionCardSuggestionType } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { AgentSuggestionDetails } from "@app/components/markdown/suggestion/AgentSuggestionDetails";
import {
  ConversationalSuggestionCard,
  RestrictedSuggestionCard,
} from "@app/components/markdown/suggestion/ConversationalSuggestionCard";
import {
  DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS,
  isAgentActionCardSuggestion,
} from "@app/components/markdown/suggestion/suggestion_directives";
import {
  sortAgentSuggestionsByBuilderOrder,
  sortSkillSuggestionsByBuilderOrder,
} from "@app/components/markdown/suggestion/suggestion_order";
import { makeDirective } from "@app/components/markdown/suggestion/suggestionDirective";
import {
  trackSuggestionCardDecision,
  trackSuggestionDetailsOpen,
  trackSuggestionTargetPreviewOpen,
  useTrackSuggestionCardViews,
} from "@app/components/markdown/suggestion/suggestionTracking";
import { getIcon } from "@app/components/resources/resources_icons";
import {
  PendingSkillSuggestionDetails,
  ReviewedSuggestionCard,
} from "@app/components/skill_builder/SkillSuggestionCard";
import {
  useReviewSuggestionBatches,
  useSuggestionBatch,
} from "@app/hooks/useSuggestionBatches";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { SuggestionBatchReviewState } from "@app/types/api/assistant/suggestion_batches";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import {
  AGENT_SIDE_PANEL_TYPE,
  SKILL_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { BatchSuggestionType } from "@app/types/suggestions/batch_suggestion";
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
  Tooltip,
} from "@dust-tt/sparkle";
import groupBy from "lodash/groupBy";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useCallback, useMemo, useState } from "react";

function toBatchProperties(attributes: Record<string, string>) {
  return { batchId: attributes.sId };
}

/**
 * Remark directive plugin transforming `:batch_edit[]{sId=xxx}` into a custom element rendered by
 * the batch card.
 */
export const batchSuggestionDirective = makeDirective(
  "batch_edit",
  toBatchProperties
);

interface SuggestionTargetSectionProps {
  targetLabel: "Agent" | "Skill";
  name: string;
  visual: ReactElement;
  onOpen: () => void;
  isDeletion?: boolean;
  defaultOpen: boolean;
  children: ReactNode;
}

// One collapsible block per agent or skill. A deleted target has no detail to show: a chip flags
// it instead.
function SuggestionTargetSection({
  targetLabel,
  name,
  visual,
  onOpen,
  isDeletion = false,
  defaultOpen,
  children,
}: SuggestionTargetSectionProps) {
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
        <Chip size="xs" color="warning" label="Delete" />
      </div>
    );
  }

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="rounded-xl bg-background p-3"
    >
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

const GROUPED_AGENT_SUGGESTION_LABELS: Record<string, string | undefined> = {
  skills: "Skills",
  tools: "Tools",
  sub_agent: "Sub-agents",
};

interface SuggestionTarget {
  name: string;
  visual: ReactElement;
  isDeletion: boolean;
  onOpen: () => void;
}

interface AgentSuggestionTargetInput {
  owner: LightWorkspaceType;
  batchId: string;
  agentId: string;
  suggestions: AgentSuggestionType[];
}

function useAgentSuggestionTarget({
  owner,
  batchId,
  agentId,
  suggestions,
}: AgentSuggestionTargetInput) {
  const { openPanel } = useConversationSidePanelContext();
  const displayable = sortAgentSuggestionsByBuilderOrder(
    suggestions.filter(isAgentActionCardSuggestion)
  );
  const { agentConfiguration, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agentId,
      disabled: displayable.some((s) =>
        DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS.includes(s.kind)
      ),
    });

  // A created agent is a pending placeholder: its name is the suggested one.
  const creation = displayable.find((s) => s.kind === "create");
  const target: SuggestionTarget = {
    name:
      creation?.kind === "create"
        ? creation.suggestion.name
        : (agentConfiguration?.name ?? "Agent"),
    visual:
      agentConfiguration && !creation ? (
        <Avatar visual={agentConfiguration.pictureUrl} size="3xs" />
      ) : (
        <Avatar icon={getIcon("ActionRobotIcon")} size="3xs" />
      ),
    isDeletion: displayable.some((s) => s.kind === "delete"),
    onOpen: () => {
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
    },
  };

  return {
    displayable,
    agentConfiguration,
    isLoading: isAgentConfigurationLoading,
    target,
  };
}

interface SkillSuggestionTargetInput {
  owner: LightWorkspaceType;
  batchId: string;
  skillId: string;
  suggestions: SkillSuggestionType[];
}

function useSkillSuggestionTarget({
  owner,
  batchId,
  skillId,
  suggestions,
}: SkillSuggestionTargetInput) {
  const { openPanel } = useConversationSidePanelContext();
  // A created skill is a pending placeholder: its name is the suggested one.
  const creation = suggestions.find(isCreateSkillSuggestion);
  const { skill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId,
    disabled: !!creation,
  });
  const SkillAvatar = useMemo(() => getSkillAvatarIcon(skill), [skill]);

  const target: SuggestionTarget = {
    name: creation ? creation.suggestion.name : (skill?.name ?? "Skill"),
    visual: <SkillAvatar size="3xs" />,
    isDeletion: suggestions.some(isDeleteSkillSuggestion),
    onOpen: () => {
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
    },
  };

  return { skill, isLoading: isSkillLoading, target };
}

interface AgentSuggestionsDiffProps extends AgentSuggestionTargetInput {
  pendingSkillNameById: Map<string, string>;
  defaultOpen: boolean;
}

function AgentSuggestionsDiff({
  owner,
  batchId,
  agentId,
  suggestions,
  pendingSkillNameById,
  defaultOpen,
}: AgentSuggestionsDiffProps) {
  const { displayable, agentConfiguration, isLoading, target } =
    useAgentSuggestionTarget({ owner, batchId, agentId, suggestions });
  // Each skill, tool and sub-agent is its own suggestion: they are listed together, under a
  // single heading per kind. Grouping keeps the sorted order of the kinds.
  const suggestionsByKind = groupBy(displayable, (s) => s.kind);

  if (isLoading) {
    return <LoadingBlock className="h-12 w-full" />;
  }

  return (
    <SuggestionTargetSection
      targetLabel="Agent"
      {...target}
      defaultOpen={defaultOpen}
    >
      {Object.entries(suggestionsByKind).map(([kind, kindSuggestions]) => {
        const groupLabel = GROUPED_AGENT_SUGGESTION_LABELS[kind];
        return groupLabel ? (
          <AgentSuggestionGroup
            key={kind}
            owner={owner}
            label={groupLabel}
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

interface SkillSuggestionsDiffProps extends SkillSuggestionTargetInput {
  defaultOpen: boolean;
}

function SkillSuggestionsDiff({
  owner,
  batchId,
  skillId,
  suggestions,
  defaultOpen,
}: SkillSuggestionsDiffProps) {
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
    <SuggestionTargetSection
      targetLabel="Skill"
      {...target}
      defaultOpen={defaultOpen}
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

function AgentTargetPill(input: AgentSuggestionTargetInput) {
  const { isLoading, target } = useAgentSuggestionTarget(input);

  if (isLoading) {
    return <LoadingBlock className="h-6 w-20" />;
  }

  return <SuggestionTargetPill {...target} />;
}

function SkillTargetPill(input: SkillSuggestionTargetInput) {
  const { isLoading, target } = useSkillSuggestionTarget(input);

  if (isLoading) {
    return <LoadingBlock className="h-6 w-20" />;
  }

  return <SuggestionTargetPill {...target} />;
}

interface SuggestionTargetListProps {
  pills: ReactElement[];
}

function SuggestionTargetList({ pills }: SuggestionTargetListProps) {
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

export function getBatchSuggestionTitle(batch: BatchSuggestionType): string {
  return batch.title ?? "Suggested changes";
}

interface PendingBatchSuggestionCardProps {
  owner: LightWorkspaceType;
  batch: BatchSuggestionType;
  onAccept: () => void;
  onReject: () => void;
  disabled?: boolean;
  isAccepting?: boolean;
  isDeclining?: boolean;
  titleAside?: ReactNode;
  secondaryAction?: ReactNode;
}

export function PendingBatchSuggestionCard({
  owner,
  batch,
  onAccept,
  onReject,
  disabled = false,
  isAccepting = false,
  isDeclining = false,
  titleAside,
  secondaryAction,
}: PendingBatchSuggestionCardProps) {
  const agentSuggestionsByAgentId = groupBy(
    batch.agentSuggestions,
    (s) => s.agentId
  );
  const skillSuggestionsBySkillId = groupBy(
    batch.skillSuggestions,
    (s) => s.skillConfigurationId
  );

  const pendingSkillNameById = new Map(
    batch.skillSuggestions
      .filter(isCreateSkillSuggestion)
      .map((s) => [s.skillConfigurationId, s.suggestion.name])
  );

  return (
    <ConversationalSuggestionCard
      title={getBatchSuggestionTitle(batch)}
      titleAside={titleAside}
      analysis={batch.analysis}
      targetList={
        <SuggestionTargetList
          pills={[
            ...Object.entries(agentSuggestionsByAgentId).map(
              ([agentId, suggestions]) => (
                <AgentTargetPill
                  key={agentId}
                  owner={owner}
                  batchId={batch.id}
                  agentId={agentId}
                  suggestions={suggestions}
                />
              )
            ),
            ...Object.entries(skillSuggestionsBySkillId).map(
              ([skillId, suggestions]) => (
                <SkillTargetPill
                  key={skillId}
                  owner={owner}
                  batchId={batch.id}
                  skillId={skillId}
                  suggestions={suggestions}
                />
              )
            ),
          ]}
        />
      }
      collapsibleContent={
        <div className="flex flex-col gap-2">
          {Object.entries(agentSuggestionsByAgentId).map(
            ([agentId, suggestions], index) => (
              <AgentSuggestionsDiff
                key={agentId}
                owner={owner}
                batchId={batch.id}
                agentId={agentId}
                suggestions={suggestions}
                pendingSkillNameById={pendingSkillNameById}
                defaultOpen={index === 0}
              />
            )
          )}
          {Object.entries(skillSuggestionsBySkillId).map(
            ([skillId, suggestions], index) => (
              <SkillSuggestionsDiff
                key={skillId}
                owner={owner}
                batchId={batch.id}
                skillId={skillId}
                suggestions={suggestions}
                defaultOpen={batch.agentSuggestions.length === 0 && index === 0}
              />
            )
          )}
        </div>
      }
      onCollapsibleOpen={() =>
        trackSuggestionDetailsOpen({ batchId: batch.id })
      }
      onAccept={onAccept}
      onReject={onReject}
      secondaryAction={secondaryAction}
      disabled={disabled}
      isAccepting={isAccepting}
      isDeclining={isDeclining}
    />
  );
}

interface BatchSuggestionProps {
  owner: LightWorkspaceType;
  batchId: string;
}

function BatchSuggestion({ owner, batchId }: BatchSuggestionProps) {
  const { batch, isBatchLoading } = useSuggestionBatch({
    batchId,
    workspaceId: owner.sId,
  });
  const reviewBatches = useReviewSuggestionBatches({
    workspaceId: owner.sId,
  });
  const { closePanel, data } = useConversationSidePanelContext();
  const [pendingState, setPendingState] =
    useState<SuggestionBatchReviewState | null>(null);
  useTrackSuggestionCardViews(batch ? [batch] : [], { inPile: false });

  const review = async (state: SuggestionBatchReviewState) => {
    trackSuggestionCardDecision({
      decision: state === "approved" ? "allow" : "decline",
      batchId,
      inPile: false,
    });
    setPendingState(state);
    try {
      await reviewBatches([batchId], state);
      if (parseSuggestionPreviewData(data).batchId === batchId) {
        closePanel();
      }
    } finally {
      setPendingState(null);
    }
  };

  if (isBatchLoading) {
    return <LoadingBlock className="h-24 w-full" />;
  }

  // The batch is omitted when the viewer cannot read all of its suggestions.
  if (!batch) {
    return <RestrictedSuggestionCard />;
  }

  // A reviewed batch is shown like a reviewed suggestion: its state chip and title only.
  if (batch.state !== "pending") {
    return (
      <ReviewedSuggestionCard
        state={batch.state}
        title={getBatchSuggestionTitle(batch)}
        updatedAt={batch.updatedAt}
      />
    );
  }

  return (
    <PendingBatchSuggestionCard
      owner={owner}
      batch={batch}
      onAccept={() => void review("approved")}
      onReject={() => void review("rejected")}
      disabled={pendingState !== null}
      isAccepting={pendingState === "approved"}
      isDeclining={pendingState === "rejected"}
    />
  );
}

interface BatchSuggestionPluginProps {
  batchId?: string;
}

export function getBatchSuggestionPlugin(owner: LightWorkspaceType) {
  const BatchSuggestionPlugin = ({ batchId }: BatchSuggestionPluginProps) =>
    batchId ? <BatchSuggestion owner={owner} batchId={batchId} /> : null;

  return BatchSuggestionPlugin;
}
