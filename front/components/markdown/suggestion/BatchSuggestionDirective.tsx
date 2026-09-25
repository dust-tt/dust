/**
 * Markdown directive plugin for batches of conversational suggestions.
 *
 * `suggest` (building_agents_and_skills MCP) records its suggestions in one batch and emits
 * `:batch_edit[]{sId=xxx}`. The directive carries the batch id only: the card below resolves the
 * batch, and the agents and skills its suggestions target, through their SWR hooks. A batch is
 * accepted or rejected as a whole.
 */

import { AgentSuggestionDetails } from "@app/components/markdown/suggestion/AgentSuggestionDetails";
import { isAgentActionCardSuggestion } from "@app/components/markdown/suggestion/AgentSuggestionDirective";
import { ConversationalSuggestionCard } from "@app/components/markdown/suggestion/ConversationalSuggestionCard";
import { DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS } from "@app/components/markdown/suggestion/suggestion_directives";
import { makeDirective } from "@app/components/markdown/suggestion/suggestionDirective";
import {
  PendingSkillSuggestionDetails,
  ReviewedSuggestionCard,
} from "@app/components/skill_builder/SkillSuggestionCard";
import {
  usePatchSuggestionBatch,
  useRevalidateBatchTargets,
  useSuggestionBatch,
} from "@app/hooks/useSuggestionBatches";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { SuggestionBatchReviewState } from "@app/types/api/assistant/suggestion_batches";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { LoadingBlock } from "@dust-tt/sparkle";
import groupBy from "lodash/groupBy";
import { useCallback, useState } from "react";

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
  const displayable = suggestions.filter(isAgentActionCardSuggestion);
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

  // TODO(conversational-building) Allow to click on agent name to open side panel
  return (
    <div className="flex flex-col gap-3">
      <span className="heading-sm text-foreground">@{name}</span>
      {displayable.map((suggestion) => (
        <AgentSuggestionDetails
          key={suggestion.sId}
          suggestion={suggestion}
          agentConfiguration={agentConfiguration}
        />
      ))}
    </div>
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

  if (isSkillLoading) {
    return <LoadingBlock className="h-12 w-full" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="heading-sm text-foreground">
        {skill?.name ?? "Skill"}
      </span>
      {suggestions.map((suggestion) => (
        <PendingSkillSuggestionDetails
          key={suggestion.sId}
          suggestion={suggestion}
          getSkillInstructionsHtml={getSkillInstructionsHtml}
          getCurrentAgentFacingDescription={getCurrentAgentFacingDescription}
          workspaceId={owner.sId}
        />
      ))}
    </div>
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
  const { patchBatch } = usePatchSuggestionBatch({ workspaceId: owner.sId });
  const revalidateBatchTargets = useRevalidateBatchTargets({
    workspaceId: owner.sId,
  });
  const [pendingState, setPendingState] =
    useState<SuggestionBatchReviewState | null>(null);

  const review = async (state: SuggestionBatchReviewState) => {
    setPendingState(state);
    const result = await patchBatch(batchId, state);
    if (result) {
      await mutateBatch({ batches: [result.batch] }, { revalidate: false });
      if (state === "approved") {
        revalidateBatchTargets(result.batch);
      }
    } else {
      // The batch may have been reviewed from another flow: resync with the server.
      await mutateBatch();
    }
    setPendingState(null);
  };

  if (isBatchLoading) {
    return <LoadingBlock className="h-24 w-full" />;
  }

  if (!batch) {
    return null;
  }

  const agentSuggestionsByAgentId = groupBy(
    batch.agentSuggestions,
    (s) => s.agentId
  );
  const skillSuggestionsBySkillId = groupBy(
    batch.skillSuggestions,
    (s) => s.skillConfigurationId
  );

  const title = batch.title ?? "Suggested changes";

  // A reviewed batch is shown like a reviewed suggestion: its state chip and title only.
  if (batch.state !== "pending") {
    return (
      <ReviewedSuggestionCard
        state={batch.state}
        title={title}
        updatedAt={batch.updatedAt}
      />
    );
  }

  return (
    <ConversationalSuggestionCard
      title={title}
      analysis={batch.analysis}
      collapsibleContent={
        <div className="flex flex-col gap-4">
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
