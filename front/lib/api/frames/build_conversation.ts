import { createConversation } from "@app/lib/api/assistant/conversation";
import type { Authenticator } from "@app/lib/auth";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";

/**
 * Run `fn` with a short-lived conversation in `pod`, for Frame builds that happen outside any
 * conversation (e.g. an import from the Files UI). Function bundles are built in the invoking
 * conversation's sandbox, and neither the Frame's own sandbox nor the legacy Pod sandbox is
 * configured for that.
 *
 * The conversation is created with `test` visibility, which Pod conversation lists and new-
 * conversation notifications already exclude. Its sandbox is destroyed and the conversation
 * soft-deleted once `fn` returns, whatever the outcome.
 */
export async function withFrameBuildConversation<T, E>(
  auth: Authenticator,
  {
    pod,
    title,
  }: {
    pod: SpaceResource;
    title: string;
  },
  fn: (conversation: ConversationWithoutContentType) => Promise<Result<T, E>>
): Promise<Result<T, E>> {
  const conversation = await createConversation(auth, {
    title,
    visibility: "test",
    spaceId: pod.id,
  });

  try {
    return await fn(conversation.toJSON());
  } finally {
    const cleanup = await ConversationSandboxAdapter.deleteSandbox(
      auth,
      conversation
    );
    if (cleanup.isErr()) {
      logger.error(
        {
          conversationId: conversation.sId,
          error: cleanup.error.message,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Failed to delete the Frame build conversation sandbox"
      );
    }
    await conversation.updateVisibilityToDeleted(auth);
  }
}
