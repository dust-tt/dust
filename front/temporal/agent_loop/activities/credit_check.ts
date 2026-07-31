import {
  type CreditCheckResult,
  checkMessageCreditApprovalGate,
  checkPoolCreditGate,
} from "@app/lib/api/assistant/credit_check";
import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";

export async function checkCreditsActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<CreditCheckResult> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  const poolGateResult = await checkPoolCreditGate(auth, {
    userMessageOrigin: agentLoopArgs.userMessageOrigin ?? null,
  });
  if (poolGateResult.shouldStop) {
    return poolGateResult;
  }

  // The workspace pool is fine; check whether this single message is running away with credits.
  return checkMessageCreditApprovalGate(auth, {
    agentMessageId: agentLoopArgs.agentMessageId,
    userMessageId: agentLoopArgs.userMessageId,
    userMessageOrigin: agentLoopArgs.userMessageOrigin ?? null,
  });
}
