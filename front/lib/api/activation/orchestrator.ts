import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

export type NudgePlan = {
  podId: string;
  spaceId: string;
  targetUserId: string;
};

export type SkippedUser = {
  userId: string;
  podId: string;
};

export type OrchestratorResult = {
  eligible: NudgePlan[];
  skipped: SkippedUser[];
};

/**
 * Determines which users are eligible for activation based on the workspace and user filter
 */
export async function determineEligibleActivationUsers({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string | null;
}): Promise<OrchestratorResult> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const pods = await ProjectMetadataResource.fetchActivationPods(auth);

  const spaces = await SpaceResource.fetchByModelIds(
    auth,
    pods.map((p) => p.spaceId)
  );
  const spaceByModelId = new Map(spaces.map((space) => [space.id, space]));
  const membersBySpaceModelId =
    await SpaceResource.fetchDistinctActiveManualGroupMembersBySpaces(
      auth,
      spaces
    );

  const eligible: NudgePlan[] = [];
  const skipped: SkippedUser[] = [];

  for (const pod of pods) {
    const space = spaceByModelId.get(pod.spaceId);
    if (!space) {
      continue;
    }

    const members = membersBySpaceModelId.get(pod.spaceId) ?? [];

    for (const member of members) {
      if (userId !== null && member.sId !== userId) {
        continue;
      }

      if (!isEligibleForActivation(member)) {
        skipped.push({ userId: member.sId, podId: pod.sId });
        continue;
      }

      eligible.push({
        podId: pod.sId,
        spaceId: space.sId,
        targetUserId: member.sId,
      });
    }
  }

  return { eligible, skipped };
}

// TODO: This is a placeholder for the actual eligibility logic
function isEligibleForActivation(user: UserResource): boolean {
  return true;
}
