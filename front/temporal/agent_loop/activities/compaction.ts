import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import { runCompaction } from "@app/temporal/agent_loop/lib/compaction";

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
  });

  if (compactionRes.isErr()) {
    throw new Error(`Compaction failed: ${compactionRes.error}`);
  }
}
