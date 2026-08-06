import type { Authenticator } from "@app/lib/auth";
import type { uiView } from "@app/lib/models/activation/activation_pod";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserFactory } from "@app/tests/utils/UserFactory";

export class ActivationPodFactory {
  static async create(
    auth: Authenticator,
    {
      pod,
      uiView,
    }: {
      pod: SpaceResource;
      uiView?: uiView | null;
    }
  ): Promise<ActivationPodResource> {
    const user = await UserFactory.basic();

    return ActivationPodResource.makeNew(auth, {
      pod,
      user,
      uiView,
    });
  }
}
