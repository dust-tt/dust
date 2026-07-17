import type { Authenticator } from "@app/lib/auth";
import { ActivationNudgeModel } from "@app/lib/models/activation/activation_nudge";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";

export class ActivationNudgeFactory {
  static async create(
    auth: Authenticator,
    {
      pod,
      trigger,
      createdAt,
    }: { pod: SpaceResource; trigger: TriggerResource; createdAt?: Date }
  ): Promise<ActivationNudgeResource> {
    const nudge = await ActivationNudgeResource.makeNew(auth, {
      pod,
      trigger,
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
