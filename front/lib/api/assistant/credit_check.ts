import { computeAgentMessageCredits } from "@app/lib/api/assistant/credit_cost";
import type { Authenticator } from "@app/lib/auth";
import { getCachedPoolCredits } from "@app/lib/metronome/credit_balance";
import { getWorkspaceCreditPoolStatus } from "@app/lib/metronome/user_block";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import { isCreditPricedPlan } from "@app/types/plan";
import type { ModelId } from "@app/types/shared/model_id";

export type CreditCheckResult =
  | { shouldStop: false; reason: null }
  | { shouldStop: true; reason: "credits_exhausted" };

const DO_NOT_STOP: CreditCheckResult = { shouldStop: false, reason: null };

/**
 * Determines whether the agent loop should stop because the workspace's
 * credit pool is exhausted. Fails open, non-blocking for callers.
 *
 * We do not yet emit per-step usage events (TODO: Issue #8715).
 *
 * We can therefore just read the pool balance each step and subtract this message's locally-recorded run usage so far.
 *
 */
export async function checkPoolCreditGate(
  auth: Authenticator,
  {
    agentMessageId,
    agentMessageModelId,
    runIds,
    isFreeUsage,
  }: {
    agentMessageId: string;
    agentMessageModelId: ModelId;
    runIds: string[];
    isFreeUsage: boolean;
  }
): Promise<CreditCheckResult> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.subscription()?.plan;

  if (!owner.metronomeCustomerId || !plan || !isCreditPricedPlan(plan)) {
    return DO_NOT_STOP;
  }

  // In overage, spending past the committed pool is expected (it's billed as
  // overage), not the runaway scenario this guards against — and the balance is irrelevant.
  const poolStatus = await getWorkspaceCreditPoolStatus(owner.sId);
  if (poolStatus === "overage") {
    return DO_NOT_STOP;
  }

  const poolBalanceAwu = await getCachedPoolCredits(
    owner.sId,
    owner.metronomeCustomerId
  );
  if (poolBalanceAwu === null) {
    logger.warn(
      { workspaceId: owner.sId, agentMessageId },
      "[CreditCheck] pool balance unavailable, not stopping"
    );
    return DO_NOT_STOP;
  }

  const localSpendAwu = await computeLocalSpendAwu(auth, {
    agentMessageModelId,
    runIds,
    isFreeUsage,
  });
  if (poolBalanceAwu - localSpendAwu <= 0) {
    return { shouldStop: true, reason: "credits_exhausted" };
  }

  return DO_NOT_STOP;
}

// Full AWU this message has spent so far.
//
// Re-summing every step is O(steps²) DB work.
// A running accumulator would make it linear but has to live in (replay-carried) workflow
// state; deferred until the per-step-emission stage restructures this.
async function computeLocalSpendAwu(
  auth: Authenticator,
  {
    agentMessageModelId,
    runIds,
    isFreeUsage,
  }: { agentMessageModelId: ModelId; runIds: string[]; isFreeUsage: boolean }
): Promise<number> {
  const [runUsages, mcpActions] = await Promise.all([
    runIds.length === 0
      ? []
      : RunResource.listByDustRunIds(auth, { dustRunIds: runIds }).then(
          (runs) => RunResource.listRunUsagesForRuns(auth, { runs })
        ),
    AgentMCPActionResource.listByAgentMessageIds(auth, [agentMessageModelId]),
  ]);

  return (
    computeAgentMessageCredits({
      runUsages,
      actions: mcpActions.map((action) => ({
        internalMCPServerName: action.metadata.internalMCPServerName,
        status: action.status,
      })),
      isFreeUsage,
    }) ?? 0
  );
}
