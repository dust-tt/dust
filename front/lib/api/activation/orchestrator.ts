import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";

export type NudgePlan = {
  podId: string;
  spaceId: number;
  targetUserId: number;
};

export type SkippedUser = {
  userId: number;
  podId: string;
};

export type OrchestratorResult = {
  eligible: NudgePlan[];
  skipped: SkippedUser[];
};

/**
 * Returns a map of spaceId → active member userIds for each pod
 */
async function fetchPodMembers(
  auth: Authenticator,
  spaceIds: number[]
): Promise<Map<number, number[]>> {
  if (spaceIds.length === 0) {
    return new Map();
  }

  const spaces = await SpaceResource.fetchByModelIds(auth, spaceIds);

  const result = new Map<number, number[]>();
  await concurrentExecutor(
    spaces,
    async (space) => {
      const members = await space.fetchDistinctActiveManualGroupMembers(auth);
      result.set(
        space.id,
        members.map((u) => u.id)
      );
    },
    { concurrency: 5 }
  );
  return result;
}

/**
 * Determines which users are eligible for activation based on the workspace and user filter
 */
export async function determineEligibleActivationUsers({
  workspaceId,
  userIdFilter,
}: {
  workspaceId: string;
  userIdFilter: number | null;
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

    for (const userId of members) {
      if (userIdFilter !== null && userId !== userIdFilter) {
        continue;
      }

      if (!isEligibleForActivation(userId)) {
        skipped.push({ userId, podId: pod.sId });
        continue;
      }

      eligible.push({
        podId: pod.sId,
        spaceId: pod.spaceId,
        targetUserId: userId,
      });
    }
  }

  return { eligible, skipped };
}

// TODO: This is a placeholder for the actual eligibility logic
function isEligibleForActivation(userId: number): boolean {
  return true;
}
