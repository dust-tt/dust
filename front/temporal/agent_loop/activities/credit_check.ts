import type { CreditCheckResult } from "@app/lib/api/assistant/credit_check";
import {
  checkCreditSpendCheckpointGate,
  checkPoolCreditGate,
} from "@app/lib/api/assistant/credit_check";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { awuFromMicroUsd } from "@app/lib/credits/agent_message_billing";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";

export async function checkCreditsActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<CreditCheckResult> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  return checkPoolCreditGate(auth, {
    userMessageOrigin: agentLoopArgs.userMessageOrigin ?? null,
  });
}

/**
 * AWU credits spent so far by this agent message's own run (its accumulated
 * `runIds`), not the user's account-wide cycle spend. Mirrors the LLM-only,
 * pre-tool-cost approximation `checkCostAndSubagentsThresholds` uses for its
 * per-step hard-cap check.
 */
async function getConsumedAwuCredits(
  auth: Authenticator,
  { runIds }: { runIds: string[] }
): Promise<number> {
  if (runIds.length === 0) {
    return 0;
  }

  const runResources = await RunResource.listByDustRunIds(auth, {
    dustRunIds: runIds,
  });
  const runUsages = await RunResource.listRunUsagesForRuns(auth, {
    runs: runResources,
  });

  const totalCostMicroUsd = runUsages.reduce(
    (acc, usage) => acc + usage.costMicroUsd,
    0
  );

  return awuFromMicroUsd(totalCostMicroUsd);
}

export type CreditSpendCheckpointActivityResult =
  // Once `skipRemainingChecks` is true, the workflow stops calling this activity for the rest of
  // the execution: the user already acknowledged the checkpoint, or the execution is exempt from
  // it. Neither can flip back within an execution.
  | { crossed: false; skipRemainingChecks: boolean }
  | { crossed: true; thresholdAwuCredits: number };

const NOT_CROSSED: CreditSpendCheckpointActivityResult = {
  crossed: false,
  skipRemainingChecks: false,
};
const SKIP: CreditSpendCheckpointActivityResult = {
  crossed: false,
  skipRemainingChecks: true,
};

/**
 * Has this agent message's own spend crossed the credit spend checkpoint? Pure decision: the
 * pause itself is persisted and notified by the finalize activity, so a failure or timeout here
 * can never leave the message marked paused while the loop keeps running.
 */
/**
 * @cc [owner:avervaet,label:backend] checkpoint-pure-check
 * This activity MUST NOT persist, publish or notify anything: it only returns whether the
 * threshold was crossed. Recording the pause belongs to the finalize path, so a failed or timed
 * out check never leaves a message marked paused while its loop keeps running.
 */
/**
 * @cc [owner:avervaet,label:product] checkpoint-acknowledged-skips
 * When the message's checkpoint status is `acknowledged`, the activity MUST return not crossed
 * with `skipRemainingChecks: true`, whatever the spend. A user who chose to continue is never
 * asked again for the same message.
 */
export async function checkCreditSpendCheckpointActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<CreditSpendCheckpointActivityResult> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  const state =
    await ConversationResource.fetchAgentMessageCreditSpendCheckpointState(
      auth,
      { agentMessageId: agentLoopArgs.agentMessageId }
    );
  if (state?.status === "acknowledged") {
    return SKIP;
  }

  // Read after the step completed, so the step's own run is already accounted for.
  const consumedAwuCredits = await getConsumedAwuCredits(auth, {
    runIds: state?.runIds ?? [],
  });

  const result = await checkCreditSpendCheckpointGate(auth, {
    consumedAwuCredits,
  });
  if (result.crossed) {
    return { crossed: true, thresholdAwuCredits: result.thresholdAwuCredits };
  }

  return result.exempt ? SKIP : NOT_CROSSED;
}
