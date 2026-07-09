import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId } from "@app/types/shared/model_id";

export type NudgePlan = {
  podId: string;
  spaceModelId: ModelId;
  targetUserModelId: ModelId;
};

export type SkippedUser = {
  userModelId: ModelId;
  podId: string;
};

export type OrchestratorResult = {
  eligible: NudgePlan[];
  skipped: SkippedUser[];
};

/**
 * Returns a map of space model id → active member user model ids for each pod.
 */
async function fetchPodMembers(
  auth: Authenticator,
  spaceModelIds: ModelId[]
): Promise<Map<ModelId, ModelId[]>> {
  if (spaceModelIds.length === 0) {
    return new Map();
  }

  const spaces = await SpaceResource.fetchByModelIds(auth, spaceModelIds);
  const membersBySpaceModelId =
    await SpaceResource.fetchDistinctActiveManualGroupMembersBySpaces(
      auth,
      spaces
    );

  const result = new Map<ModelId, ModelId[]>();
  for (const [spaceModelId, members] of membersBySpaceModelId) {
    result.set(
      spaceModelId,
      members.map((u) => u.id)
    );
  }
  return result;
}

/**
 * Determines which users are eligible for activation based on the workspace and user filter
 */
export async function determineEligibleActivationUsers({
  workspaceId,
  userModelIdFilter,
}: {
  workspaceId: string;
  userModelIdFilter: ModelId | null;
}): Promise<OrchestratorResult> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const pods = await ProjectMetadataResource.fetchActivationPods(auth);
  const podMembers = await fetchPodMembers(
    auth,
    pods.map((p) => p.spaceId)
  );

  const eligible: NudgePlan[] = [];
  const skipped: SkippedUser[] = [];

  for (const pod of pods) {
    const members = podMembers.get(pod.spaceId) ?? [];

    for (const userModelId of members) {
      if (userModelIdFilter !== null && userModelId !== userModelIdFilter) {
        continue;
      }

      if (!isEligibleForActivation(userModelId)) {
        skipped.push({ userModelId, podId: pod.sId });
        continue;
      }

      eligible.push({
        podId: pod.sId,
        spaceModelId: pod.spaceId,
        targetUserModelId: userModelId,
      });
    }
  }

  return { eligible, skipped };
}

// TODO: This is a placeholder for the actual eligibility logic
function isEligibleForActivation(userModelId: ModelId): boolean {
  return true;
}
