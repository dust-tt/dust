import { evaluateActivation } from "@app/lib/api/activation/evaluator";
import { isEligibleForNudge } from "@app/lib/api/activation/nudge";
import { emitActivationEvent } from "@app/lib/api/activation/trigger";
import { Authenticator } from "@app/lib/auth";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
  const userSIds = new Set<string>();
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
      userSIds.add(member.sId);
    }
  }

  if (candidates.length === 0) {
    return new Ok({ eligible: [], skipped: [] });
  }

  const activationResult = await evaluateActivation(auth, {
    userIds: [...userSIds],
    asOf,
  });
  if (activationResult.isErr()) {
    return new Err(activationResult.error);
  }
  const byUser = activationResult.value;

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
    if (result?.activated) {
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

export async function runActivationForWorkspace({
  workspaceId,
  userId = null,
  dryRun,
  asOf,
}: {
  workspaceId: string;
  userId?: string | null;
  dryRun: boolean;
  asOf?: Date;
}): Promise<Result<OrchestratorResult, Error>> {
  // Activation conversations live in Pods, which are restricted spaces: request
  // all groups so admin auth can read/write them.
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });

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

  // Emit one activation event per eligible (pod, user), carrying the target
  // user's sId so only that user's pod trigger matches and fires.
  if (plan.eligible.length === 0) {
    return new Ok(plan);
  }
  const uniqueSpaceIds = [...new Set(plan.eligible.map((p) => p.spaceId))];
  const pods = await SpaceResource.fetchByIds(auth, uniqueSpaceIds);
  const podBySId = new Map(pods.map((pod) => [pod.sId, pod]));

  const users = await UserResource.fetchByIds([
    ...new Set(plan.eligible.map((p) => p.targetUserId)),
  ]);
  const userBySId = new Map(users.map((user) => [user.sId, user]));

  // Collected across pods so the trigger lookup and the nudge inserts below
  // can each run as a single batched query instead of one per pod.
  const firedTriggersByPod: { pod: SpaceResource; triggerId: string }[] = [];

  await concurrentExecutor(
    plan.eligible,
    async ({ spaceId, targetUserId }) => {
      const pod = podBySId.get(spaceId);
      if (!pod) {
        logger.error(
          { workspaceId, spaceId },
          "[Activation] pod space not found, skipping event"
        );
        return;
      }

      const user = userBySId.get(targetUserId) ?? null;
      if (!(await isEligibleForNudge(auth, pod, { user }))) {
        logger.info(
          { workspaceId, spaceId, userId: targetUserId },
          "[Activation] Pod is not eligible for a nudge, skipping."
        );
        return;
      }

      const result = await emitActivationEvent(auth, pod, targetUserId);
      if (result.isErr()) {
        logger.error(
          { workspaceId, spaceId, userId: targetUserId, error: result.error },
          "[Activation] Failed to emit activation event for user."
        );
        return;
      }

      const { triggerId } = result.value;
      if (!triggerId) {
        logger.warn(
          { workspaceId, spaceId, userId: targetUserId },
          "[Activation] Activation event did not fire the pod's trigger."
        );
        return;
      }

      firedTriggersByPod.push({ pod, triggerId });
    },
    { concurrency: 3 }
  );

  if (firedTriggersByPod.length > 0) {
    const triggers = await TriggerResource.fetchByIds(
      auth,
      firedTriggersByPod.map(({ triggerId }) => triggerId)
    );
    const triggerById = new Map(
      triggers.map((trigger) => [trigger.sId, trigger])
    );

    const nudges: { pod: SpaceResource; trigger: TriggerResource }[] = [];
    for (const { pod, triggerId } of firedTriggersByPod) {
      const trigger = triggerById.get(triggerId);
      if (!trigger) {
        logger.error(
          { workspaceId, spaceId: pod.sId, triggerId },
          "[Activation] Activation trigger not found after firing."
        );
        continue;
      }
      nudges.push({ pod, trigger });
    }

    await ActivationNudgeResource.bulkCreate(auth, nudges);
  }

  return new Ok(plan);
}
