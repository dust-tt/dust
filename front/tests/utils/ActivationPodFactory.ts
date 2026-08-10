import type { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserFactory } from "@app/tests/utils/UserFactory";

export class ActivationPodFactory {
  static async create(
    auth: Authenticator,
    {
      pod,
      isCompactUIView,
    }: {
      pod: SpaceResource;
      isCompactUIView?: boolean;
    }
  ): Promise<ActivationPodResource> {
    const user = await UserFactory.basic();

    return ActivationPodResource.makeNew(auth, {
      pod,
      user,
      isCompactUIView,
    });
  }
}
