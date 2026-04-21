import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import { runCompaction } from "@app/temporal/agent_loop/lib/compaction";
import type { SupportedModel } from "@app/types/assistant/models/types";

export async function compactionActivity(
  authType: AuthenticatorType,
  {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
    model,
    sourceConversation,
  }: {
    conversationId: string;
    compactionMessageId: string;
    compactionMessageVersion: number;
    model: SupportedModel;
    sourceConversation?: {
      conversationId: string;
      messageRank: number;
    };
  }
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;
  const compactionRes = await runCompaction(auth, {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
    model,
    sourceConversation,
  });

  if (compactionRes.isErr()) {
    throw new Error(`Compaction failed: ${compactionRes.error}`);
  }
}
