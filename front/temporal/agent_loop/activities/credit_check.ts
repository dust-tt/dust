import {
  type CreditCheckResult,
  checkPoolCreditGate,
} from "@app/lib/api/assistant/credit_check";
import type { AuthenticatorType } from "@app/lib/auth";
import { isFreeOrigin } from "@app/lib/metronome/events";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import {
  getAgentLoopData,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";

// Decision of whether the agent loop should stop because the workspace's credit pool
// is exhausted.
//
// TODO (Issue #8715): Per-user usage-limit checks in addition to the workspace pool.
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
  const origin = agentLoopArgs.userMessageOrigin;
  return checkPoolCreditGate(auth, {
    agentMessageId: agentMessage.sId,
    agentMessageModelId: agentMessage.agentMessageId,
    runIds,
    isFreeUsage: origin != null && isFreeOrigin(origin),
  });
}
