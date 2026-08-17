import type { Authenticator } from "@app/lib/auth";
import { PodAppShareResource } from "@app/lib/resources/pod_app_share_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";

export class PodAppShareFactory {
  static async create(
    auth: Authenticator,
    opts: {
      space: SpaceResource;
      appName: string;
      internalMCPServerId?: string;
      toolsetName?: string;
      description?: string;
    }
  ): Promise<PodAppShareResource> {
    return PodAppShareResource.makeNew(auth, {
      space: opts.space,
      appName: opts.appName,
      internalMCPServerId:
        opts.internalMCPServerId ?? `ims_test_${opts.appName}`,
      toolsetName: opts.toolsetName ?? opts.appName,
      description: opts.description ?? `Toolset for ${opts.appName}.`,
    });
  }
}
