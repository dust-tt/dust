/**
 * Markdown directive plugin for batches of conversational suggestions.
 *
 * `suggest` (building_agents_and_skills MCP) records its suggestions in one batch and emits
 * `:batch_edit[]{sId=xxx}`. The directive carries the batch id only: the card below resolves the
 * batch, and the agents and skills its suggestions target, through their SWR hooks. A batch is
 * accepted or rejected as a whole.
 */

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { AgentSuggestionDetails } from "@app/components/markdown/suggestion/AgentSuggestionDetails";
import { isAgentActionCardSuggestion } from "@app/components/markdown/suggestion/AgentSuggestionDirective";
import { ConversationalSuggestionCard } from "@app/components/markdown/suggestion/ConversationalSuggestionCard";
import { DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS } from "@app/components/markdown/suggestion/suggestion_directives";
import { makeDirective } from "@app/components/markdown/suggestion/suggestionDirective";
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
import {
  AGENT_SIDE_PANEL_TYPE,
  SKILL_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { BatchSuggestionType } from "@app/types/suggestions/batch_suggestion";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  ChevronDown,
  ChevronUp,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  LoadingBlock,
} from "@dust-tt/sparkle";
import groupBy from "lodash/groupBy";
import partition from "lodash/partition";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

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
  children: ReactNode;
}

// One collapsible block per edited agent or skill, open by default.
function SuggestionTargetSection({
  targetLabel,
  name,
  visual,
  onOpen,
  children,
}: SuggestionTargetSectionProps) {
  return (
    <Collapsible defaultOpen className="rounded-xl bg-background p-3">
      <div className="flex h-6 items-center justify-between gap-2">
        <div className="heading-sm flex min-w-0 items-center gap-1">
          <span className="shrink-0 text-foreground">{targetLabel}</span>
          <Button
            variant="outline"
            size="xs"
            isRounded
            icon={visual}
            label={name}
            onClick={onOpen}
            className="min-w-0"
          />
        </div>
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
      {/* Spacing lives on an inner element so the height animation stays smooth.
          Diff boxes are not configurable, so they are made to take the section's background. */}
      <CollapsibleContent>
        <div className="flex flex-col gap-3 pt-3 [&_.rounded-2xl.border]:bg-transparent">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AgentSuggestionsDiffProps {
  owner: LightWorkspaceType;
  agentId: string;
  suggestions: AgentSuggestionType[];
}

function AgentSuggestionsDiff({
  owner,
  agentId,
  suggestions,
}: AgentSuggestionsDiffProps) {
  const { openPanel } = useConversationSidePanelContext();
  const displayable = suggestions.filter(isAgentActionCardSuggestion);
  // Each skill is its own suggestion: they are listed together, under a single heading.
  const [skillSuggestions, fieldSuggestions] = partition(
    displayable,
    (s) => s.kind === "skills"
  );
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
  const name =
    creation?.kind === "create"
      ? creation.suggestion.name
      : (agentConfiguration?.name ?? "Agent");

  return (
    <SuggestionTargetSection
      targetLabel="Agent"
      name={name}
      visual={
        agentConfiguration && !creation ? (
          <Avatar visual={agentConfiguration.pictureUrl} size="3xs" />
        ) : (
          <Avatar icon={getIcon("ActionRobotIcon")} size="3xs" />
        )
      }
      onOpen={() =>
        openPanel({
          type: AGENT_SIDE_PANEL_TYPE,
          agentId,
          previewSuggestionIds: displayable.map((s) => s.sId),
        })
      }
    >
      {fieldSuggestions.map((suggestion) => (
        <AgentSuggestionDetails
          key={suggestion.sId}
          owner={owner}
          suggestion={suggestion}
          agentConfiguration={agentConfiguration}
        />
      ))}
      {skillSuggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Skills</span>
          <div className="divide-y divide-border">
            {skillSuggestions.map((suggestion) => (
              <AgentSuggestionDetails
                key={suggestion.sId}
                owner={owner}
                suggestion={suggestion}
                agentConfiguration={agentConfiguration}
              />
            ))}
          </div>
        </div>
      )}
    </SuggestionTargetSection>
  );
}

interface SkillSuggestionsDiffProps {
  owner: LightWorkspaceType;
  skillId: string;
  suggestions: SkillSuggestionType[];
}

function SkillSuggestionsDiff({
  owner,
  skillId,
  suggestions,
}: SkillSuggestionsDiffProps) {
  const { openPanel } = useConversationSidePanelContext();
  const { skill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId,
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
      targetLabel="Skill"
      name={skill?.name ?? "Skill"}
      visual={<SkillAvatar size="3xs" />}
      onOpen={() =>
        openPanel({
          type: SKILL_SIDE_PANEL_TYPE,
          skillId,
          previewSuggestionIds: suggestions.map((s) => s.sId),
        })
      }
    >
      {suggestions.map((suggestion) => (
        <PendingSkillSuggestionDetails
          key={suggestion.sId}
          suggestion={suggestion}
          getSkillInstructionsHtml={getSkillInstructionsHtml}
          getCurrentAgentFacingDescription={getCurrentAgentFacingDescription}
          workspaceId={owner.sId}
          isConversational
        />
      ))}
    </SuggestionTargetSection>
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

  return (
    <ConversationalSuggestionCard
      title={getBatchSuggestionTitle(batch)}
      titleAside={titleAside}
      analysis={batch.analysis}
      collapsibleContent={
        <div className="flex flex-col gap-2">
          {Object.entries(agentSuggestionsByAgentId).map(
            ([agentId, suggestions]) => (
              <AgentSuggestionsDiff
                key={agentId}
                owner={owner}
                agentId={agentId}
                suggestions={suggestions}
              />
            )
          )}
          {Object.entries(skillSuggestionsBySkillId).map(
            ([skillId, suggestions]) => (
              <SkillSuggestionsDiff
                key={skillId}
                owner={owner}
                skillId={skillId}
                suggestions={suggestions}
              />
            )
          )}
        </div>
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
  const { batch, isBatchLoading, mutateBatch } = useSuggestionBatch({
    batchId,
    workspaceId: owner.sId,
  });
  const reviewBatches = useReviewSuggestionBatches({
    workspaceId: owner.sId,
    mutateBatches: mutateBatch,
  });
  const [pendingState, setPendingState] =
    useState<SuggestionBatchReviewState | null>(null);

  const review = async (state: SuggestionBatchReviewState) => {
    setPendingState(state);
    try {
      await reviewBatches([batchId], state);
    } finally {
      setPendingState(null);
    }
  };

  if (isBatchLoading) {
    return <LoadingBlock className="h-24 w-full" />;
  }

  if (!batch) {
    return null;
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
