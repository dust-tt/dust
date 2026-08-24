import type { Authenticator } from "@app/lib/auth";
import type { ActivationPodKind } from "@app/lib/models/activation/activation_pod";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId } from "@app/types/shared/model_id";

export type ActivationPodWithSpace = {
  pod: SpaceResource;
  activationPod: ActivationPodResource;
};

// Maps each user to one Activation Pod of the given kind. Defaults to the
// Learning Space, matching GET /activation-pod with no podId.
export async function listActivationPodsByUser(
  auth: Authenticator,
  { kind = "learning" }: { kind?: ActivationPodKind } = {}
): Promise<Map<ModelId, ActivationPodWithSpace>> {
  const byUser = new Map<ModelId, ActivationPodWithSpace>();

  const activationPods = await ActivationPodResource.listForWorkspace(auth, {
    kind,
  });
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
