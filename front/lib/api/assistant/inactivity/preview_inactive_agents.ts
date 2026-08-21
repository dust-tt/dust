import type { AgentArchivalSkip } from "@app/lib/api/assistant/inactivity/fetch_inactive_agents";
import {
  countSkipsByReason,
  fetchArchivableAgents,
} from "@app/lib/api/assistant/inactivity/fetch_inactive_agents";
import type { AgentInactivityPolicyError } from "@app/lib/api/assistant/inactivity/policy";
import { computeInactivityCutoffAt } from "@app/lib/api/assistant/inactivity/policy";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * What `archiveInactiveWorkspaceAgents` would archive, without archiving it. Same input, same reads,
 * same rules, same output shape — the one difference is that `archivedAgentIds` is instead the
 * `eligibleAgentIds` nothing was done to. Kept deliberately parallel so the two can be read side by
 * side and seen to agree.
 *
 * It cannot mutate: `archiveAgentConfiguration` is not imported here.
 */

export interface InactiveAgentsPreviewInput {
  thresholdDays: number;
  evaluatedAt: Date;
}

export interface InactiveAgentsPreview {
  evaluatedAt: Date;
  cutoffAt: Date;
  eligibleAgentIds: string[];
  skipped: AgentArchivalSkip[];
}

export type InactiveAgentsPreviewResult = Result<
  InactiveAgentsPreview,
  AgentInactivityPolicyError
>;

export async function previewInactiveAgents(
  auth: Authenticator,
  { thresholdDays, evaluatedAt }: InactiveAgentsPreviewInput
): Promise<InactiveAgentsPreviewResult> {
  const workspace = auth.getNonNullableWorkspace();

  const cutoffRes = computeInactivityCutoffAt({ thresholdDays, evaluatedAt });
  if (cutoffRes.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        thresholdDays,
        err: cutoffRes.error,
      },
      "Cannot preview inactive agents: unusable workspace inactivity policy"
    );
    return new Err(cutoffRes.error);
  }
  const cutoffAt = cutoffRes.value;

  const { eligible, skipped } = await fetchArchivableAgents(auth, {
    cutoffAt,
  });

  const eligibleAgentIds = eligible.map(({ agentId }) => agentId);

  logger.info(
    {
      workspaceId: workspace.sId,
      thresholdDays,
      evaluatedAt,
      cutoffAt,
      eligibleCount: eligibleAgentIds.length,
      skippedCount: skipped.length,
      skippedCountByReason: countSkipsByReason(skipped),
    },
    "Finished previewing inactive agents"
  );

  return new Ok({
    evaluatedAt,
    cutoffAt,
    eligibleAgentIds,
    skipped,
  });
}
