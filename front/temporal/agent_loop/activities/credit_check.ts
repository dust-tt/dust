import type { CreditCheckResult } from "@app/lib/api/assistant/credit_check";
import {
  checkCreditSpendCheckpointGate,
  checkPoolCreditGate,
} from "@app/lib/api/assistant/credit_check";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { awuFromMicroUsd } from "@app/lib/credits/agent_message_billing";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { DescendantRunData } from "@app/temporal/agent_loop/activities/cost_threshold_warnings";
import {
  collectDescendantData,
  getCumulativeCostMicroUsd,
} from "@app/temporal/agent_loop/activities/cost_threshold_warnings";
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

type CreditSpendCheckpointDecision =
  | { crossed: false; skipRemainingChecks: boolean }
  | { crossed: true; thresholdAwuCredits: number };

export type CreditSpendCheckpointActivityResult =
  CreditSpendCheckpointDecision & {
    descendantData?: DescendantRunData;
  };

const SKIP: CreditSpendCheckpointActivityResult = {
  crossed: false,
  skipRemainingChecks: true,
};
function notCrossedResult(
  descendantData: DescendantRunData
): CreditSpendCheckpointActivityResult {
  return { crossed: false, skipRemainingChecks: false, descendantData };
}

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
    await ConversationResource.fetchCreditSpendCheckpointStateForAgentMessage(
      auth,
      { agentMessageId: agentLoopArgs.agentMessageId }
    );
  if (state?.status === "acknowledged") {
    return SKIP;
  }

  // Read after the step completed, so the step's own run is already accounted for.
  const descendantData = await collectDescendantData(auth, {
    rootAgentMessageId: agentLoopArgs.agentMessageId,
  });
  const totalCostMicroUsd = await getCumulativeCostMicroUsd(auth, {
    dustRunIds: descendantData.dustRunIds,
  });
  const consumedAwuCredits = awuFromMicroUsd(totalCostMicroUsd);

  const result = await checkCreditSpendCheckpointGate(auth, {
    consumedAwuCredits,
  });
  if (result.crossed) {
    return { crossed: true, thresholdAwuCredits: result.thresholdAwuCredits };
  }

  return result.exempt ? SKIP : notCrossedResult(descendantData);
}
