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
    sourceConversationId,
    sourceMessageRank,
  }: {
    conversationId: string;
    compactionMessageId: string;
    compactionMessageVersion: number;
    model: SupportedModel;
  } & (
    | {
        sourceConversationId?: undefined;
        sourceMessageRank?: undefined;
      }
    | {
        sourceConversationId: string;
        sourceMessageRank: number;
      }
  )
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;
  const sourceOverride =
    sourceConversationId === undefined || sourceMessageRank === undefined
      ? {}
      : { sourceConversationId, sourceMessageRank };

  const compactionRes = await runCompaction(auth, {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
    model,
    ...sourceOverride,
  });

  if (compactionRes.isErr()) {
    throw new Error(`Compaction failed: ${compactionRes.error}`);
  }
}
