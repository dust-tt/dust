import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import type { AuthenticatorType } from "@app/lib/auth";
import type { RunAgentArgs } from "@app/types/assistant/agent_run";

export async function ensureConversationTitleActivity(
  authType: AuthenticatorType,
  runAgentArgs: RunAgentArgs
): Promise<void> {
  await ensureConversationTitle(authType, runAgentArgs);
}
