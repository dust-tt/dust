import type { Authenticator } from "@app/lib/auth";
import type { ActivationPodKind } from "@app/lib/models/activation/activation_pod";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

export interface GetActivationPodResponseBody {
  podId: string | null;
  kind: ActivationPodKind | null;
}

export async function getActivationPodInfo(
  auth: Authenticator,
  { podId }: { podId?: string } = {}
): Promise<GetActivationPodResponseBody> {
  if (podId) {
    const space = await SpaceResource.fetchById(auth, podId);
    if (!space) {
      return { podId: null, kind: null };
    }
    const activationPod = await ActivationPodResource.fetchBySpace(auth, space);
    return {
      podId: activationPod ? space.sId : null,
      kind: activationPod?.kind ?? null,
    };
  }

  const allPods = await ActivationPodResource.listByUser(auth);
  const learningPod = allPods.find((p) => p.kind === "learning") ?? null;
  if (!learningPod) {
    return { podId: null, kind: null };
  }
  const [pod] = await SpaceResource.fetchByModelIds(auth, [
    learningPod.spaceId,
  ]);
  if (!pod) {
    return { podId: null, kind: null };
  }
  return {
    podId: pod.sId,
    kind: "learning",
  };
}
