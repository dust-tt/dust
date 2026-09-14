import { evaluateActivation } from "@app/lib/api/activation/evaluator";
import {
  isEligibleForNudge,
  postActivationNudge,
} from "@app/lib/api/activation/nudge";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
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

type Candidate = { podId: string; spaceId: string; userId: string };

function toNudgePlan(candidate: Candidate): NudgePlan {
  return {
    podId: candidate.podId,
    spaceId: candidate.spaceId,
    targetUserId: candidate.userId,
  };
}

/**
 * Determines which users are eligible for activation based on the workspace and user filter
 */
export async function determineEligibleActivationUsers(
  auth: Authenticator,
  {
    userIds = null,
    asOf,
    overrideChecks = false,
  }: {
    userIds?: string[] | null;
    asOf?: Date;
    overrideChecks?: boolean;
  } = {}
): Promise<Result<OrchestratorResult, Error>> {
  if (auth.plan()?.isByok && !overrideChecks) {
    return new Ok({ eligible: [], skipped: [] });
  }

  const workspace = auth.getNonNullableWorkspace();
  const workspaceId = workspace.sId;

  const pods = await ActivationPodResource.listForWorkspace(auth);
  if (pods.length === 0) {
    return new Ok({ eligible: [], skipped: [] });
  }

  const spaces = await SpaceResource.fetchByModelIds(
    auth,
    pods.map((p) => p.spaceId)
  );
  const spaceByModelId = new Map(spaces.map((space) => [space.id, space]));

  const owners = await UserResource.fetchByModelIds([
    ...new Set(pods.map((pod) => pod.userId)),
  ]);
  if (owners.length === 0) {
    return new Ok({ eligible: [], skipped: [] });
  }
  const ownerByModelId = new Map(owners.map((owner) => [owner.id, owner]));

  const { memberships } = await MembershipResource.getActiveMemberships({
    users: owners,
    workspace,
  });
  const activeOwnerModelIds = new Set(
    memberships.map((membership) => membership.userId)
  );

  const userIdFilter = userIds === null ? null : new Set(userIds);

  // One candidate per live pod: its owner, and only if they still have an
  // active workspace membership. Extra space-group members are not nudged.
  const candidates: Candidate[] = [];
  const candidateUserIds = new Set<string>();
  for (const pod of pods) {
    if (!activeOwnerModelIds.has(pod.userId)) {
      continue;
    }
    const space = spaceByModelId.get(pod.spaceId);
    const owner = ownerByModelId.get(pod.userId);
    if (!space || !owner) {
      continue;
    }
    if (userIdFilter !== null && !userIdFilter.has(owner.sId)) {
      continue;
    }
    candidates.push({
      podId: pod.sId,
      spaceId: space.sId,
      userId: owner.sId,
    });
    candidateUserIds.add(owner.sId);
  }

  if (candidates.length === 0) {
    return new Ok({ eligible: [], skipped: [] });
  }

  // Poke override skips activation-status entirely: no need to evaluate.
  if (overrideChecks) {
    return new Ok({
      eligible: candidates.map(toNudgePlan),
      skipped: [],
    });
  }

  const activationResult = await evaluateActivation(auth, {
    userIds: Array.from(candidateUserIds),
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
    eligible.push(toNudgePlan(candidate));
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
    userIds: userId ? [userId] : null,
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
