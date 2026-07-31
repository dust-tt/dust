import { computeAndStoreAgentMessageConsumptionAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/store";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function storeAgentMessageConsumptionAttributionActivity(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const { agentMessageId, conversationId } = agentLoopArgs;

  await computeAndStoreAgentMessageConsumptionAttribution(auth, {
    agentMessageId,
    conversationId,
  });
}
