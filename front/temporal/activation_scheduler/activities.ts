import { isEligibleForNudge } from "@app/lib/api/activation/nudge";
import { emitActivationEvent } from "@app/lib/api/activation/trigger";
import { Authenticator } from "@app/lib/auth";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

const ACTIVATION_PODS_CONCURRENCY = 4;

/**
 * Re-fires the activation trigger for every Activation Pod in the workspace,
 * nudging users back into the pod's activation conversation.
 */
export async function runActivationForWorkspaceActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  // Activation conversations live in Pods, which are restricted spaces: request
  // all groups so admin auth can read/write them.
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });

  const activationPodsMetadata =
    await ProjectMetadataResource.fetchActivationPods(auth);
  if (activationPodsMetadata.length === 0) {
    return;
  }

  const pods = await SpaceResource.fetchByModelIds(
    auth,
    activationPodsMetadata.map((metadata) => metadata.spaceId)
  );

  // Collected across pods so the trigger lookup and the nudge inserts below
  // can each run as a single batched query instead of one per pod.
  const firedTriggersByPod: { pod: SpaceResource; triggerId: string }[] = [];

  await concurrentExecutor(
    pods,
    async (pod) => {
      if (!(await isEligibleForNudge(auth, pod))) {
        logger.info(
          { workspaceId, spaceId: pod.sId },
          "[ActivationScheduler] Pod is within the nudge frequency cap, skipping."
        );
        return;
      }

      const result = await emitActivationEvent(auth, pod);
      if (result.isErr()) {
        logger.error(
          { workspaceId, spaceId: pod.sId, error: result.error },
          "[ActivationScheduler] Failed to emit activation event for pod."
        );
        return;
      }

      const { triggerId } = result.value;
      if (!triggerId) {
        logger.warn(
          { workspaceId, spaceId: pod.sId },
          "[ActivationScheduler] Activation event did not fire the pod's trigger."
        );
        return;
      }

      firedTriggersByPod.push({ pod, triggerId });
    },
    { concurrency: ACTIVATION_PODS_CONCURRENCY }
  );

  if (firedTriggersByPod.length === 0) {
    return;
  }

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
        "[ActivationScheduler] Activation trigger not found after firing."
      );
      continue;
    }
    nudges.push({ pod, trigger });
  }

  await ActivationNudgeResource.bulkCreate(auth, nudges);
}
