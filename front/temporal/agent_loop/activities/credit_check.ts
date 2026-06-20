import {
  type CreditCheckResult,
  checkPoolCreditGate,
} from "@app/lib/api/assistant/credit_check";
import type { AuthenticatorType } from "@app/lib/auth";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import {
  getAgentLoopData,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";

// Stage 1: pure decision of whether the agent loop should stop because the workspace's credit pool
// is exhausted. Deliberately publishes nothing and has no side effect — the workflow owns the
// terminal finalize (finalizeCreditStoppedAgentLoopActivity) so the stop is published exactly once,
// the same flag + dedicated-finalize shape as graceful stop / cancel / interrupt. Keeping this pure
// also makes the activity safe to retry.
// TODO (Issue #8715): iterate toward (1) a resumable pause the user can continue from, and
// (2) per-user usage-limit checks in addition to the workspace pool.
export async function checkCreditsActivity(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
    runIds,
  }: { agentLoopArgs: AgentLoopArgsWithTiming; runIds: string[] }
): Promise<CreditCheckResult> {
  const runAgentDataRes = await getAgentLoopData(authType, agentLoopArgs);
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      // Conversation or message was soft-deleted mid-loop: nothing to stop here, other paths
      // already handle winding the workflow down.
      return { shouldStop: false, reason: null };
    }
    throw runAgentDataRes.error;
  }

  const { auth, agentMessage } = runAgentDataRes.value;
  return checkPoolCreditGate(auth, {
    agentMessageId: agentMessage.sId,
    runIds,
  });
}
