import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import type { AuthenticatorType } from "@app/lib/auth";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function ensureConversationTitleActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await ensureConversationTitle(authType, agentLoopArgs);
}
