import type { CreditCheckResult } from "@app/lib/api/assistant/credit_check";
import { checkPoolCreditGate } from "@app/lib/api/assistant/credit_check";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
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
