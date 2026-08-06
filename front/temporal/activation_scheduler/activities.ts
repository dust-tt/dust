import {
  isEligibleForNudge,
  postActivationNudge,
} from "@app/lib/api/activation/nudge";
import { determineEligibleActivationUsers } from "@app/lib/api/activation/orchestrator";
import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { ensureActivationWorkspaceSchedules } from "@app/temporal/activation_scheduler/client";
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

      const activationPod = activationPodBySpaceModelId.get(pod.id);
      if (!activationPod) {
        logger.error(
          { workspaceId, spaceId: pod.sId },
          "[ActivationScheduler] Pod is not an Activation Pod, skipping."
        );
        return;
      }

      const user = userBySId.get(candidate.targetUserId) ?? null;
      if (!(await isEligibleForNudge(auth, { pod, activationPod, user }))) {
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
 * Nudges a single (pod, target user) at its assigned slot. Re-runs
 * `isEligibleForNudge` right before sending: state can go stale between the
 * morning enumeration and this pod's slot, and this re-check doubles as the
 * idempotency guard against activity retries or workflow replays (a nudge
 * already recorded for the pod makes the frequency cap reject a duplicate
 * call).
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

  const activationPod = await ActivationPodResource.fetchBySpace(auth, pod);
  if (!activationPod) {
    logger.error(
      { workspaceId, spaceId: pod.sId },
      "[ActivationScheduler] Pod is not an Activation Pod, skipping."
    );
    return;
  }

  const [user] = await UserResource.fetchByIds([targetUserId]);

  if (
    !(await isEligibleForNudge(auth, {
      pod,
      activationPod,
      user: user ?? null,
    }))
  ) {
    logger.info(
      { workspaceId, spaceId: pod.sId, userId: targetUserId },
      "[ActivationScheduler] Pod no longer eligible for a nudge at slot time, skipping."
    );
    return;
  }

  const result = await postActivationNudge(auth, { pod, activationPod });
  if (result.isErr()) {
    logger.error(
      {
        workspaceId,
        spaceId: pod.sId,
        userId: targetUserId,
        error: result.error,
      },
      "[ActivationScheduler] Failed to post the nudge for pod."
    );
  }
}

// ---------------------------------------------------------------------------
// Ensure schedules activity
// ---------------------------------------------------------------------------

export async function ensureActivationWorkspaceSchedulesActivity(): Promise<{
  started: string[];
  stopped: string[];
}> {
  return ensureActivationWorkspaceSchedules();
}
