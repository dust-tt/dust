import { postUserMessage } from "@app/lib/api/assistant/conversation";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  ConversationMetadata,
  ConversationVisibility,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

// Answered by a static reply rather than a model, see `getStaticReplyForUserMessage`. The tool
// instruction only applies if that static reply ever stops matching.
const BOOTSTRAP_MESSAGE = `<dust_system>
The user just opened the @analyst panel on the workspace Analytics page.
Do NOT call any tools. Greet briefly and offer 2-3 example questions they could ask.
</dust_system>`;

/**
 * How the panel's conversation is created: hidden, so it only reaches the user's history once they
 * write in it, and titled up front so `ensureConversationTitle` does not name it after the
 * bootstrap message.
 */
export const ANALYTICS_PANEL_CONVERSATION_INIT: {
  title: string;
  visibility: ConversationVisibility;
  metadata: ConversationMetadata;
} = {
  title: `Ask ${GLOBAL_AGENTS_SID.ANALYST}`,
  visibility: "test",
  metadata: { origin: "analytics_panel" },
};

/**
 * @cc [owner:achilleburah,label:security] bootstrap-message-is-server-authored
 * The `analytics_panel` origin must only ever be written here, on the first message of a
 * conversation this function was given. The origin hides a message from the conversation UI, so a
 * caller able to choose it could hide messages the agent still reads.
 */
export async function postAnalyticsPanelBootstrapMessage(
  auth: Authenticator,
  {
    conversation,
    user,
  }: { conversation: ConversationResource; user: UserResource }
): Promise<Result<UserMessageType, APIErrorWithContentfulStatusCode>> {
  const messageRes = await postUserMessage(auth, {
    conversationResource: conversation,
    content: BOOTSTRAP_MESSAGE,
    mentions: [{ configurationId: GLOBAL_AGENTS_SID.ANALYST }],
    context: {
      timezone: "UTC",
      username: user.username,
      fullName: user.fullName(),
      email: user.email,
      profilePictureUrl: user.imageUrl,
      origin: "analytics_panel",
    },
    skipToolsValidation: false,
  });

  if (messageRes.isErr()) {
    return messageRes;
  }

  return new Ok(messageRes.value.userMessage);
}

/**
 * @cc [owner:achilleburah,label:product] promotes-only-hidden-analytics-panel-conversations
 * Makes an Analytics-panel conversation visible in the user's conversation history by moving it
 * from `test` to `unlisted` visibility. It is a no-op unless the conversation is both
 * `test`-visibility and marked as Analytics-panel in its metadata, and it is idempotent.
 */
export async function promoteAnalyticsPanelConversation(
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
): Promise<void> {
  if (
    conversation.visibility !== "test" ||
    conversation.metadata?.origin !== "analytics_panel"
  ) {
    return;
  }

  await conversation.updateVisibilityToUnlisted(auth);
}
