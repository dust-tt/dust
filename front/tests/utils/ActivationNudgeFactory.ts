import type { Authenticator } from "@app/lib/auth";
import { ActivationNudgeModel } from "@app/lib/models/activation/activation_nudge";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import type { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";

export class ActivationNudgeFactory {
  static async create(
    auth: Authenticator,
    {
      activationPod,
      pod,
      conversation,
      createdAt,
    }: {
      activationPod: ActivationPodResource;
      pod: SpaceResource;
      conversation?: ConversationResource;
      createdAt?: Date;
    }
  ): Promise<ActivationNudgeResource> {
    const nudge = await ActivationNudgeResource.makeNew(auth, {
      activationPod,
      pod,
    });

    if (conversation) {
      await nudge.markPosted(conversation);
    }

    if (createdAt) {
      await ActivationNudgeModel.update(
        { createdAt },
        { where: { id: nudge.id } }
      );
    }

    return nudge;
  }
}
