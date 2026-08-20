import { hiddenPodNameForConversation } from "@app/lib/api/projects/constants";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const HIDDEN_POD_CREATION_LOCK_TIMEOUT_MS = 30_000;

/**
 * The hidden pod backing a standalone conversation's Frame apps, or null when it has none yet.
 * Read-only: use this wherever a conversation's app runtime must be observed without bringing one
 * into existence (listings, the move guard).
 */
export async function fetchHiddenPodForConversation(
  auth: Authenticator,
  conversationId: string
): Promise<SpaceResource | null> {
  return SpaceResource.fetchByName(
    auth,
    hiddenPodNameForConversation(conversationId)
  );
}

/**
 * The hidden pod backing a standalone conversation's Frame apps, created on first need.
 *
 * Non-restricted on purpose: the pod's function bundles are resolved through the space permission
 * filter, so a restricted pod would break the Frame for everyone but its author — including other
 * readers of the same conversation. Only the creator lands in the pod's editor group, so
 * `pod_member_required` still means the conversation's owner and not the whole workspace.
 */
export async function fetchOrCreateHiddenPodForConversation(
  auth: Authenticator,
  conversationId: string
): Promise<Result<SpaceResource, Error>> {
  const existing = await fetchHiddenPodForConversation(auth, conversationId);
  if (existing) {
    return new Ok(existing);
  }

  // Several tool calls in one agent loop can race here, and the space name carries a uniqueness
  // constraint, so the loser would fail rather than reuse the winner's pod.
  return executeWithLock(
    `hidden_pod:${conversationId}`,
    async () => {
      const raced = await fetchHiddenPodForConversation(auth, conversationId);
      if (raced) {
        return new Ok(raced);
      }

      const result = await createSpaceAndGroup(
        auth,
        {
          name: hiddenPodNameForConversation(conversationId),
          isRestricted: false,
          spaceKind: "project",
          memberIds: [],
          managementMode: "manual",
        },
        // The user never asked for this pod, so it must not consume their pod allowance.
        { ignoreWorkspaceLimit: true }
      );
      if (result.isErr()) {
        return new Err(new Error(result.error.message));
      }

      return new Ok(result.value);
    },
    HIDDEN_POD_CREATION_LOCK_TIMEOUT_MS
  );
}
