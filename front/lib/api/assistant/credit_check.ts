import type { Authenticator } from "@app/lib/auth";
import { getCachedPoolCredits } from "@app/lib/metronome/credit_balance";
import { intelligenceAwuFromRunUsages } from "@app/lib/metronome/events";
import { getWorkspaceCreditPoolStatus } from "@app/lib/metronome/user_block";
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import { isCreditPricedPlan } from "@app/types/plan";

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
    runIds,
  }: {
    agentMessageId: string;
    runIds: string[];
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

  const localUsageAwu = await computeLocalRunUsageAwu(auth, runIds);
  if (poolBalanceAwu - localUsageAwu <= 0) {
    return { shouldStop: true, reason: "credits_exhausted" };
  }

  return DO_NOT_STOP;
}

async function computeLocalRunUsageAwu(
  auth: Authenticator,
  runIds: string[]
): Promise<number> {
  if (runIds.length === 0) {
    return 0;
  }

  const runs = await RunResource.listByDustRunIds(auth, {
    dustRunIds: runIds,
  });
  const runUsages = await RunResource.listRunUsagesForRuns(auth, { runs });

  return intelligenceAwuFromRunUsages(runUsages);
}
