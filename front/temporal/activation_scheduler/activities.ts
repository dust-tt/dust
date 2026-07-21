import { isEligibleForNudge } from "@app/lib/api/activation/nudge";
import { determineEligibleActivationUsers } from "@app/lib/api/activation/orchestrator";
import { emitActivationEvent } from "@app/lib/api/activation/trigger";
import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  ACTIVATION_WORKDAY_WINDOW_MINUTES,
  ACTIVATION_WORKDAY_WINDOW_START_MINUTES,
} from "@app/temporal/activation_scheduler/config";
import { getNudgeSlotAtMs } from "@app/temporal/activation_scheduler/slots";

const ACTIVATION_PODS_CONCURRENCY = 4;

export type EligiblePodNudge = {
  podId: string;
  targetUserId: string;
  slotAtMs: number;
};

/**
 * Enumerates every (pod, target user) still eligible for activation in the
 * workspace, gates each on `isEligibleForNudge`, and assigns the eligible
 * ones a deterministic slot within the regional workday window. This is the
 * planning step: it does not send anything, since state can go stale between
 * this pass (run once at the start of the workday) and a pod's actual slot
 * later in the day.
 */
export async function enumerateEligiblePodsForNudgeActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<EligiblePodNudge[]> {
  // Activation conversations live in Pods, which are restricted spaces: request
  // all groups so admin auth can read/write them.
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });

  const planResult = await determineEligibleActivationUsers(auth, {
    userId: null,
  });
  if (planResult.isErr()) {
    throw planResult.error;
  }
  const { eligible } = planResult.value;
  if (eligible.length === 0) {
    return [];
  }

  const uniqueSpaceIds = [...new Set(eligible.map((c) => c.spaceId))];
  const pods = await SpaceResource.fetchByIds(auth, uniqueSpaceIds);
  const podBySId = new Map(pods.map((pod) => [pod.sId, pod]));

  const users = await UserResource.fetchByIds([
    ...new Set(eligible.map((c) => c.targetUserId)),
  ]);
  const userBySId = new Map(users.map((user) => [user.sId, user]));

  const timezone = REGION_TIMEZONES[config.getCurrentRegion()];
  const now = new Date();

  const eligiblePods: EligiblePodNudge[] = [];

  await concurrentExecutor(
    eligible,
    async (candidate) => {
      const pod = podBySId.get(candidate.spaceId);
      if (!pod) {
        logger.error(
          { workspaceId, spaceId: candidate.spaceId },
          "[ActivationScheduler] Pod space not found, skipping."
        );
        return;
      }

      const user = userBySId.get(candidate.targetUserId) ?? null;
      if (!(await isEligibleForNudge(auth, pod, { user }))) {
        logger.info(
          { workspaceId, spaceId: pod.sId, userId: candidate.targetUserId },
          "[ActivationScheduler] Pod is not eligible for a nudge, skipping."
        );
        return;
      }

      eligiblePods.push({
        podId: pod.sId,
        targetUserId: candidate.targetUserId,
        slotAtMs: getNudgeSlotAtMs({
          podModelId: pod.id,
          timezone,
          windowStartMinutes: ACTIVATION_WORKDAY_WINDOW_START_MINUTES,
          windowMinutes: ACTIVATION_WORKDAY_WINDOW_MINUTES,
          now,
        }),
      });
    },
    { concurrency: ACTIVATION_PODS_CONCURRENCY }
  );

  return eligiblePods.sort((a, b) => a.slotAtMs - b.slotAtMs);
}

/**
 * Re-fires the activation trigger for a single (pod, target user), at its
 * assigned slot. Re-runs `isEligibleForNudge` right before sending: state can
 * go stale between the morning enumeration and this pod's slot, and this
 * re-check doubles as the idempotency guard against activity retries or
 * workflow replays (a nudge already recorded for the pod makes the frequency
 * cap reject a duplicate call).
 */
export async function reGateAndNudgePodActivity({
  workspaceId,
  podId,
  targetUserId,
}: {
  workspaceId: string;
  podId: string;
  targetUserId: string;
}): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });

  const pod = await SpaceResource.fetchById(auth, podId, {
    includeDeleted: true,
  });
  if (!pod) {
    logger.error(
      { workspaceId, spaceId: podId },
      "[ActivationScheduler] Pod not found at nudge time, skipping."
    );
    return;
  }

  const [user] = await UserResource.fetchByIds([targetUserId]);

  if (!(await isEligibleForNudge(auth, pod, { user: user ?? null }))) {
    logger.info(
      { workspaceId, spaceId: pod.sId, userId: targetUserId },
      "[ActivationScheduler] Pod no longer eligible for a nudge at slot time, skipping."
    );
    return;
  }

  const result = await emitActivationEvent(auth, pod, targetUserId);
  if (result.isErr()) {
    logger.error(
      {
        workspaceId,
        spaceId: pod.sId,
        userId: targetUserId,
        error: result.error,
      },
      "[ActivationScheduler] Failed to emit activation event for pod."
    );
    return;
  }

  const { triggerId } = result.value;
  if (!triggerId) {
    logger.warn(
      { workspaceId, spaceId: pod.sId, userId: targetUserId },
      "[ActivationScheduler] Activation event did not fire the pod's trigger."
    );
    return;
  }

  const [trigger] = await TriggerResource.fetchByIds(auth, [triggerId]);
  if (!trigger) {
    logger.error(
      { workspaceId, spaceId: pod.sId, triggerId },
      "[ActivationScheduler] Activation trigger not found after firing."
    );
    return;
  }

  await ActivationNudgeResource.makeNew(auth, { pod, trigger });
}
