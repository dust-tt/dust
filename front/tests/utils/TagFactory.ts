import { Authenticator } from "@app/lib/auth";
import { TagResource } from "@app/lib/resources/tags_resource";
import type { WorkspaceType } from "@app/types";

export class TagFactory {
  static async create(
    workspace: WorkspaceType,
    params: {
      name: string;
    }
  ) {
    const auth = await Authenticator.internalBuilderForWorkspace(workspace.sId);
    return TagResource.makeNew(auth, {
      name: params.name,
    });
  }
}
