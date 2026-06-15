import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import {
  failCompactionMessage,
  runCompaction,
} from "@app/temporal/agent_loop/lib/compaction";
import type { CompactionSourceConversation } from "@app/types/assistant/compaction";
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
    sourceConversation?: CompactionSourceConversation;
  }
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);
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

export async function compactionCleanupActivity(
  authType: AuthenticatorType,
  {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
  }: {
    conversationId: string;
    compactionMessageId: string;
    compactionMessageVersion: number;
  }
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);
  await failCompactionMessage(auth, {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
  });
}
