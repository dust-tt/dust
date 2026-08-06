import type { Authenticator } from "@app/lib/auth";
import { ActivationNudgeModel } from "@app/lib/models/activation/activation_nudge";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import type { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";

export class ActivationNudgeFactory {
  static async create(
    auth: Authenticator,
    {
      activationPod,
      pod,
      createdAt,
    }: {
      activationPod: ActivationPodResource;
      pod: SpaceResource;
      createdAt?: Date;
    }
  ): Promise<ActivationNudgeResource> {
    const nudge = await ActivationNudgeResource.makeNew(auth, {
      activationPod,
      pod,
    });

    if (createdAt) {
      await ActivationNudgeModel.update(
        { createdAt },
        { where: { id: nudge.id } }
      );
    }

    return nudge;
  }
}
