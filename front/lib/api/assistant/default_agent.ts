import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import {
  GLOBAL_AGENTS_SID,
  HOME_DEFAULT_AGENT_METADATA_KEY,
} from "@app/types/assistant/assistant";

/**
 * Resolve the agent sId to pre-select for a new conversation started by `auth`'s user.
 *
 * Precedence today: the user's personal, workspace-scoped default (if set and still
 * accessible) → @dust. This is the single source of truth for both the client sticky
 * mention (mirrored by `useHomeDefaultAgent`) and the server-side auto-injection backstop
 * in `postUserMessage`.
 *
 * To later add a workspace-admin default, insert a `workspace.metadata.defaultAgentSId`
 * read between the personal default and the @dust fallback below — no call site changes.
 */
export async function resolveHomeDefaultAgentSId(
  auth: Authenticator
): Promise<string> {
  const user = auth.user();
  if (!user) {
    return GLOBAL_AGENTS_SID.DUST;
  }

  const workspace = auth.getNonNullableWorkspace();
  const metadata = await user.getMetadata(
    HOME_DEFAULT_AGENT_METADATA_KEY,
    workspace.id
  );

  const candidateSId = metadata?.value;
  if (!candidateSId) {
    return GLOBAL_AGENTS_SID.DUST;
  }

  // Validate the stored agent is still accessible to the user (it may have been
  // archived, deleted, or moved to a space the user can no longer reach). Fall back
  // to @dust rather than producing a broken mention.
  const agent = await getAgentConfiguration(auth, {
    agentId: candidateSId,
    variant: "extra_light",
  });

  if (agent && agent.status === "active") {
    return agent.sId;
  }

  return GLOBAL_AGENTS_SID.DUST;
}
