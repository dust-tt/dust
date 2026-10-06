import type { Authenticator } from "@app/lib/auth";
import { WORKOS_METADATA_KEY_PREFIX } from "@app/lib/iam/users";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  AgentMemorySummaryType,
  PatchMyProfileBody,
  UserProfileType,
} from "@app/types/api/user_profile";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

// Profile fields are scoped to the workspace: a user may hold a different job title in each
// workspace they belong to.
const PRONOUNS_METADATA_KEY = "profile:pronouns";
const JOB_TITLE_METADATA_KEY = "profile:job_title";
// Synced from the identity provider (see `syncCustomAttributesToUserMetadata`).
const DIRECTORY_JOB_TITLE_METADATA_KEY = `${WORKOS_METADATA_KEY_PREFIX}job_title`;

async function getDirectoryJobTitle(
  user: UserResource,
  workspaceModelId: number
): Promise<string | null> {
  const metadata = await user.getMetadata(
    DIRECTORY_JOB_TITLE_METADATA_KEY,
    workspaceModelId
  );
  return metadata?.value || null;
}

/**
 * @cc [owner:radjakahoul,label:product] directory-job-title-wins
 * Profile shown to workspace members. When the identity provider syncs a job title, it MUST be the
 * one shown and the user MUST NOT be able to override it; the user-entered job title only applies
 * when the directory has none. Groups are filtered by what the caller can read, so a member only
 * sees the groups visible to them.
 */
export async function getUserProfile(
  auth: Authenticator,
  user: UserResource
): Promise<UserProfileType> {
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const [pronouns, jobTitle, directoryJobTitle, groups] = await Promise.all([
    user.getMetadata(PRONOUNS_METADATA_KEY, workspaceModelId),
    user.getMetadata(JOB_TITLE_METADATA_KEY, workspaceModelId),
    getDirectoryJobTitle(user, workspaceModelId),
    GroupResource.listUserGroupsInWorkspace({
      auth,
      user,
      groupKinds: [...MANAGEABLE_GROUP_KINDS],
    }),
  ]);

  return {
    pronouns: pronouns?.value || null,
    jobTitle: directoryJobTitle ?? (jobTitle?.value || null),
    isJobTitleManaged: directoryJobTitle !== null,
    groups: groups.map((g) => ({ sId: g.sId, name: g.name })),
  };
}

export async function updateUserProfile(
  auth: Authenticator,
  user: UserResource,
  { pronouns, jobTitle }: PatchMyProfileBody
): Promise<Result<void, Error>> {
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  // A job title managed by the identity provider is read-only: the client omits it, and any value
  // differing from the directory one is an attempt to override it.
  const directoryJobTitle = await getDirectoryJobTitle(user, workspaceModelId);
  if (directoryJobTitle !== null) {
    if (jobTitle !== undefined && jobTitle !== directoryJobTitle.trim()) {
      return new Err(
        new Error("The job title is managed by your identity provider.")
      );
    }
    await user.setMetadata(
      PRONOUNS_METADATA_KEY,
      pronouns ?? "",
      workspaceModelId
    );
    return new Ok(undefined);
  }

  await Promise.all([
    user.setMetadata(PRONOUNS_METADATA_KEY, pronouns ?? "", workspaceModelId),
    jobTitle !== undefined
      ? user.setMetadata(
          JOB_TITLE_METADATA_KEY,
          jobTitle ?? "",
          workspaceModelId
        )
      : undefined,
  ]);
  return new Ok(undefined);
}

/**
 * The current user's agent memories, grouped by agent, most recently updated first. Agents the
 * user can no longer fetch are dropped.
 */
export async function listAgentMemoriesForCurrentUser(
  auth: Authenticator
): Promise<AgentMemorySummaryType[]> {
  const memories = await AgentMemoryResource.listForCurrentUser(auth);
  if (memories.length === 0) {
    return [];
  }

  // Memories are sorted by updatedAt DESC, so the first one per agent is its latest.
  const memoriesByAgentId = new Map<string, AgentMemoryResource[]>();
  for (const memory of memories) {
    const agentMemories = memoriesByAgentId.get(memory.agentConfigurationId);
    if (agentMemories) {
      agentMemories.push(memory);
    } else {
      memoriesByAgentId.set(memory.agentConfigurationId, [memory]);
    }
  }

  const agents = await AgentResource.fetchByIds(auth, [
    ...memoriesByAgentId.keys(),
  ]);

  return removeNulls(
    agents.map((agent) => {
      const agentMemories = memoriesByAgentId.get(agent.sId);
      if (!agentMemories || agentMemories.length === 0) {
        return null;
      }
      const [latest] = agentMemories;
      return {
        agent: {
          sId: agent.sId,
          name: agent.name,
          pictureUrl: agent.pictureUrl,
        },
        memoriesCount: agentMemories.length,
        lastUpdated: latest.updatedAt.toISOString(),
        latestContent: latest.content,
      };
    })
  );
}
