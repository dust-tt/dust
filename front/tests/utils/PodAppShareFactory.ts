import type { Authenticator } from "@app/lib/auth";
import { PodAppShareResource } from "@app/lib/resources/pod_app_share_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";

export class PodAppShareFactory {
  static async create(
    auth: Authenticator,
    opts: {
      space: SpaceResource;
      appPrefix: string;
      internalMCPServerId?: string;
      toolsetName?: string;
      description?: string;
    }
  ): Promise<PodAppShareResource> {
    return PodAppShareResource.makeNew(auth, {
      space: opts.space,
      appPrefix: opts.appPrefix,
      internalMCPServerId:
        opts.internalMCPServerId ?? `ims_test_${opts.appPrefix}`,
      toolsetName: opts.toolsetName ?? opts.appPrefix,
      description: opts.description ?? `Toolset for ${opts.appPrefix}.`,
    });
  }
}
