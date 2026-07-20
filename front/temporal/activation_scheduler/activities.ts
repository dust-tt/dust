import { emitActivationEvent } from "@app/lib/api/activation/trigger";
import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
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

  await concurrentExecutor(
    pods,
    async (pod) => {
      const result = await emitActivationEvent(auth, pod);
      if (result.isErr()) {
        logger.error(
          { workspaceId, spaceId: pod.sId, error: result.error },
          "[ActivationScheduler] Failed to emit activation event for pod."
        );
      }
    },
    { concurrency: ACTIVATION_PODS_CONCURRENCY }
  );
}
