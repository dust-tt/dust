import type { Authenticator } from "@app/lib/auth";

// Central switch controlling whether new users get the onboarding conversation
// experience.
export const ONBOARDING_CONVERSATION_ENABLED = true;

/**
 * @cc [owner:avervaet,label:security] onboarding-metadata-server-owned
 * User metadata keys starting with this prefix are server-owned, and onboarding ownership checks
 * trust their values: a client-driven write or delete MUST NOT touch a key with this prefix chosen
 * or matched (including by prefix or wildcard) from client input, and a value written under such a
 * key from client input MUST be validated against a fixed allowlist before writing.
 */
export const ONBOARDING_METADATA_PREFIX = "onboarding:";

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
