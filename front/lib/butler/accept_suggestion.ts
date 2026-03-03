import { updateConversationTitle } from "@app/lib/api/assistant/conversation/title";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { ConversationButlerSuggestionResource } from "@app/lib/resources/conversation_butler_suggestion_resource";
import { Err, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Apply the side-effect for an accepted suggestion, then mark it as accepted.
 *
 * Each suggestion type has its own side-effect (e.g. rename_title updates the
 * conversation title). This function centralises that dispatch so API handlers
 * stay thin.
 */
export async function acceptSuggestion(
  auth: Authenticator,
  {
    suggestion,
    conversationId,
  }: {
    suggestion: ConversationButlerSuggestionResource;
    conversationId: string;
  }
): Promise<Result<ConversationButlerSuggestionResource, DustError>> {
  switch (suggestion.suggestionType) {
    case "rename_title": {
      const metadata = suggestion.metadata as { suggestedTitle: string };
      const titleRes = await updateConversationTitle(auth, {
        conversationId,
        title: metadata.suggestedTitle,
      });

      if (titleRes.isErr()) {
        return new Err(
          new DustError(
            "internal_error",
            "Failed to update conversation title."
          )
        );
      }
      break;
    }
    case "call_agent":
      // No server-side side-effect: the frontend handles call_agent acceptance
      // by submitting a message with the suggested prompt and agent mention.
      break;
    default:
      assertNever(suggestion.suggestionType);
  }

  return suggestion.accept(auth);
}
