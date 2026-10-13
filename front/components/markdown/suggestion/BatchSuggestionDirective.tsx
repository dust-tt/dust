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
import {
  ConversationalSuggestionCard,
  RestrictedSuggestionCard,
} from "@app/components/markdown/suggestion/ConversationalSuggestionCard";
import { makeDirective } from "@app/components/markdown/suggestion/suggestionDirective";
import {
  AgentTargetPill,
  SkillTargetPill,
  SuggestionTargetList,
} from "@app/components/markdown/suggestion/SuggestionTargetList";
import {
  AgentSuggestionsDiff,
  SkillSuggestionsDiff,
} from "@app/components/markdown/suggestion/SuggestionTargetSection";
import {
  trackSuggestionCardDecision,
  trackSuggestionDetailsOpen,
  useTrackSuggestionCardViews,
} from "@app/components/markdown/suggestion/suggestionTracking";
import { ReviewedSuggestionCard } from "@app/components/skill_builder/SkillSuggestionCard";
import {
  useReviewSuggestionBatches,
  useSuggestionBatch,
} from "@app/hooks/useSuggestionBatches";
import type { SuggestionBatchReviewState } from "@app/types/api/assistant/suggestion_batches";
import type { BatchSuggestionType } from "@app/types/suggestions/batch_suggestion";
import { isCreateSkillSuggestion } from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { LoadingBlock } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import groupBy from "lodash/groupBy";
import type { ReactNode } from "react";
import { useState } from "react";

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

export function getBatchSuggestionTitle(
  batch: BatchSuggestionType,
  t: (descriptor: MessageDescriptor) => string
): string {
  return batch.title ?? t(msg`Suggested changes`);
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
  const { t } = useLingui();
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
      title={getBatchSuggestionTitle(batch, t)}
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
  const { t } = useLingui();
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
        title={getBatchSuggestionTitle(batch, t)}
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
