import type { Authenticator } from "@app/lib/auth";

// Central switch controlling whether new users get the onboarding conversation
// experience.
export const ONBOARDING_CONVERSATION_ENABLED = true;

/**
 * @cc [owner:avervaet,label:security] server-owned-metadata-prefix
 * User metadata keys starting with this prefix are written server-side only: any user metadata
 * write driven by client input MUST reject such keys without writing anything.
 */
export const SERVER_OWNED_USER_METADATA_PREFIX = "onboarding:";

/**
 * @cc [owner:avervaet,label:security;product] onboarding-conversation-ownership
 * Returns true only when `conversationId` is the conversation the server recorded as the auth
 * user's onboarding conversation in the auth workspace, and false when there is no user or no
 * such record. Gating onboarding-only behavior on this is sound only while clients cannot write
 * `onboarding:*` user metadata.
 */
export async function isUserOnboardingConversation(
  auth: Authenticator,
  conversationId: string
): Promise<boolean> {
  const user = auth.user();
  const owner = auth.workspace();
  if (!user || !owner) {
    return false;
  }

  const metadata = await user.getMetadata("onboarding:conversation", owner.id);
  return metadata?.value === conversationId;
}
