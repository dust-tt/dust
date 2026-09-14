import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";

/**
 * Whether the caller may see the private data (prompt, skills, knowledge, files) of the agents and
 * skills they cannot read: a workspace admin, in a workspace with the
 * `admin_can_see_private_entities` feature flag. Everyone else gets those entities redacted or
 * filtered out.
 */
export async function canAdminSeePrivateEntities(
  auth: Authenticator
): Promise<boolean> {
  return (
    auth.isAdmin() &&
    (await hasFeatureFlag(auth, "admin_can_see_private_entities"))
  );
}
