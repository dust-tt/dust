import type { CreditCheckResult } from "@app/lib/api/assistant/credit_check";
import {
  checkCreditSpendCheckpointGate,
  checkPoolCreditGate,
} from "@app/lib/api/assistant/credit_check";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { awuFromMicroUsd } from "@app/lib/metronome/constants";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
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

export type CreditSpendCheckpointActivityResult =
  | { crossed: false; skipRemainingChecks: boolean }
  | { crossed: true; thresholdAwuCredits: number };

const SKIP: CreditSpendCheckpointActivityResult = {
  crossed: false,
  skipRemainingChecks: true,
};

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
/**
 * @cc [owner:avervaet,label:product] checkpoint-root-messages-only
 * When the triggering user message is agentic (the agent message belongs to a sub-agent), the
 * activity MUST return not crossed with `skipRemainingChecks: true`, whatever the spend. Only the
 * root message can pause: a paused sub-agent would hang its parent's tool call with no one able
 * to acknowledge it.
 */
export async function checkCreditSpendCheckpointActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<CreditSpendCheckpointActivityResult> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  const context =
    await ConversationResource.fetchCreditSpendCheckpointContextForAgentMessage(
      auth,
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        userMessageId: agentLoopArgs.userMessageId,
      }
    );
  // A missing message cannot be paused: nothing to check.
  if (
    !context ||
    !context.isRootAgentMessage ||
    context.status === "acknowledged"
  ) {
    return SKIP;
  }

  // Read after the step completed, so the step's own run is already accounted for.
  const { dustRunIds } = await collectDescendantData(auth, {
    rootAgentMessageId: agentLoopArgs.agentMessageId,
  });
  const totalCostMicroUsd = await getCumulativeCostMicroUsd(auth, {
    dustRunIds,
  });

  const result = checkCreditSpendCheckpointGate(auth, {
    consumedAwuCredits: awuFromMicroUsd(totalCostMicroUsd),
    userMessageOrigin: agentLoopArgs.userMessageOrigin ?? null,
  });
  if (result.crossed) {
    return { crossed: true, thresholdAwuCredits: result.thresholdAwuCredits };
  }

  return { crossed: false, skipRemainingChecks: result.exempt };
}
