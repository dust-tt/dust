import { GroupResource } from "@app/lib/resources/group_resource";
import type { WorkspaceType } from "@app/types/user";

export class GroupFactory {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async defaults(workspace: WorkspaceType) {
    return GroupResource.makeDefaultsForWorkspace(workspace);
  }
}
