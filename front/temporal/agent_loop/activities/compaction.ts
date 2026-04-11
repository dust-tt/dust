import { runCompaction } from "@app/temporal/agent_loop/lib/compaction";
import { Authenticator, type AuthenticatorType } from "@app/lib/auth";

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

  await runCompaction(auth, {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
  });
}
