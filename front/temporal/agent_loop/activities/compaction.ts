import { runCompaction } from "@app/lib/api/assistant/conversation/compaction";
import type { AuthenticatorType } from "@app/lib/auth";

export async function compactionActivity(
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
  await runCompaction(authType, {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
  });
}
