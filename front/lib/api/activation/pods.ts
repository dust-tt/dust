import type { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId } from "@app/types/shared/model_id";

export type ActivationPodWithSpace = {
  pod: SpaceResource;
  activationPod: ActivationPodResource;
};

// Maps each user who owns an Activation Pod to that pod. Used to decide, per
// target user, whether to provision a fresh pod or nudge an existing one.
export async function listActivationPodsByUser(
  auth: Authenticator
): Promise<Map<ModelId, ActivationPodWithSpace>> {
  const byUser = new Map<ModelId, ActivationPodWithSpace>();

  const activationPods = await ActivationPodResource.listForWorkspace(auth);
  if (activationPods.length === 0) {
    return byUser;
  }

  const spaces = await SpaceResource.fetchByModelIds(
    auth,
    activationPods.map((activationPod) => activationPod.spaceId)
  );
  const spaceByModelId = new Map(spaces.map((space) => [space.id, space]));

  for (const activationPod of activationPods) {
    const pod = spaceByModelId.get(activationPod.spaceId);
    if (!pod) {
      continue;
    }
    byUser.set(activationPod.userId, { pod, activationPod });
  }

  return byUser;
}
