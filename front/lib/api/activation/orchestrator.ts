import { evaluateActivation } from "@app/lib/api/activation/evaluator";
import {
  isEligibleForNudge,
  postActivationNudge,
} from "@app/lib/api/activation/nudge";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type NudgePlan = {
  podId: string;
  spaceId: string;
  targetUserId: string;
};

type SkippedUser = {
  userId: string;
  podId: string;
};

type OrchestratorResult = {
  eligible: NudgePlan[];
  skipped: SkippedUser[];
};

/**
 * Determines which users are eligible for activation based on the workspace and user filter
 */
export async function determineEligibleActivationUsers(
  auth: Authenticator,
  { userId, asOf }: { userId: string | null; asOf?: Date }
): Promise<Result<OrchestratorResult, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const pods = await ActivationPodResource.listForWorkspace(auth);

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

  // Build the candidate (pod, member) list and the deduped set of user sIds to
  // evaluate in a single batch.
  const candidates: { podId: string; spaceId: string; userId: string }[] = [];
  const userIds = new Set<string>();
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
      candidates.push({
        podId: pod.sId,
        spaceId: space.sId,
        userId: member.sId,
      });
      userIds.add(member.sId);
    }
  }

  if (candidates.length === 0) {
    return new Ok({ eligible: [], skipped: [] });
  }

  const activationResult = await evaluateActivation(auth, {
    userIds: Array.from(userIds),
    asOf,
  });
  if (activationResult.isErr()) {
    return new Err(activationResult.error);
  }
  const byUser = activationResult.value;

  // When forced, nudge users even if they are already considered activated:
  // the activated-user filter below is skipped so every candidate is eligible.
  const flags = await getFeatureFlags(auth);
  const forceNudge = flags.includes("activation_force_nudge");

  const eligible: NudgePlan[] = [];
  const skipped: SkippedUser[] = [];
  for (const candidate of candidates) {
    const result = byUser.get(candidate.userId);
    if (result) {
      logger.info(
        {
          workspaceId,
          userId: candidate.userId,
          podId: candidate.podId,
          activated: result.activated,
          hvucDays: result.hvucDays,
          hvucWeeks: result.hvucWeeks,
          qualifyingDays: result.evidence.qualifyingDays,
          qualifyingWeeks: result.evidence.qualifyingWeeks,
        },
        "[Activation] Evaluation result"
      );
    }
    if (result?.activated && !forceNudge) {
      skipped.push({
        userId: candidate.userId,
        podId: candidate.podId,
      });
      continue;
    }
    eligible.push({
      podId: candidate.podId,
      spaceId: candidate.spaceId,
      targetUserId: candidate.userId,
    });
  }

  return new Ok({ eligible, skipped });
}

export async function runActivationForWorkspace(
  auth: Authenticator,
  {
    userId = null,
    dryRun,
    asOf,
  }: {
    userId?: string | null;
    dryRun: boolean;
    asOf?: Date;
  }
): Promise<Result<OrchestratorResult, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const planResult = await determineEligibleActivationUsers(auth, {
    userId,
    asOf,
  });
  if (planResult.isErr()) {
    return planResult;
  }
  const plan = planResult.value;

  if (dryRun) {
    return new Ok(plan);
  }

  // Post one nudge per eligible (pod, user).
  if (plan.eligible.length === 0) {
    return new Ok(plan);
  }
  const uniqueSpaceIds = [...new Set(plan.eligible.map((p) => p.spaceId))];
  const pods = await SpaceResource.fetchByIds(auth, uniqueSpaceIds);
  const podById = new Map(pods.map((pod) => [pod.sId, pod]));

  const activationPods = await ActivationPodResource.fetchBySpaceModelIds(
    auth,
    pods.map((pod) => pod.id)
  );
  const activationPodBySpaceModelId = new Map(
    activationPods.map((activationPod) => [
      activationPod.spaceId,
      activationPod,
    ])
  );

  const users = await UserResource.fetchByIds([
    ...new Set(plan.eligible.map((p) => p.targetUserId)),
  ]);
  const userBySId = new Map(users.map((user) => [user.sId, user]));

  await concurrentExecutor(
    plan.eligible,
    async ({ spaceId, targetUserId }) => {
      const pod = podById.get(spaceId);
      if (!pod) {
        logger.error(
          { workspaceId, spaceId },
          "[Activation] pod space not found, skipping nudge"
        );
        return;
      }

      const activationPod = activationPodBySpaceModelId.get(pod.id);
      if (!activationPod) {
        logger.error(
          { workspaceId, spaceId },
          "[Activation] pod is not an Activation Pod, skipping nudge"
        );
        return;
      }

      const user = userBySId.get(targetUserId) ?? null;
      if (!(await isEligibleForNudge(auth, { pod, activationPod, user }))) {
        logger.info(
          { workspaceId, spaceId, userId: targetUserId },
          "[Activation] Pod is not eligible for a nudge, skipping."
        );
        return;
      }

      const result = await postActivationNudge(auth, { pod, activationPod });
      if (result.isErr()) {
        logger.error(
          { workspaceId, spaceId, userId: targetUserId, error: result.error },
          "[Activation] Failed to post the nudge for user."
        );
      }
    },
    { concurrency: 3 }
  );

  return new Ok(plan);
}
