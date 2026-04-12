import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import type { SupportedModel } from "@app/types/assistant/models/types";
import { runCompaction } from "@app/temporal/agent_loop/lib/compaction";

export async function compactionActivity(
  authType: AuthenticatorType,
  {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
    model,
  }: {
    conversationId: string;
    compactionMessageId: string;
    compactionMessageVersion: number;
    model: SupportedModel;
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
  });

  if (compactionRes.isErr()) {
    throw new Error(`Compaction failed: ${compactionRes.error}`);
  }
}
