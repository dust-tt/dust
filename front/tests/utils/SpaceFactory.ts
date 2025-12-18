import { faker } from "@faker-js/faker";

import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import type { WorkspaceType } from "@app/types";
import { removeNulls } from "@app/types";

export class SpaceFactory {
  static async defaults(auth: Authenticator) {
    const { globalGroup, systemGroup } = await GroupFactory.defaults(
      auth.getNonNullableWorkspace()
    );
    const { globalSpace, systemSpace, conversationsSpace } =
      await SpaceResource.makeDefaultsForWorkspace(auth, {
        globalGroup,
        systemGroup,
      });

    return {
      globalGroup,
      systemGroup,
      globalSpace,
      systemSpace,
      conversationsSpace,
    };
  }

  static async global(workspace: WorkspaceType, globalGroup?: GroupResource) {
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "global",
        workspaceId: workspace.id,
      },
      removeNulls([globalGroup]) // TODO: Add groups
    );
  }

  static async system(workspace: WorkspaceType, systemGroup?: GroupResource) {
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "system",
        workspaceId: workspace.id,
      },
      removeNulls([systemGroup]) // TODO: Add groups
    );
  }

  static async regular(workspace: WorkspaceType) {
    const name = "space " + faker.string.alphanumeric(8);
    const group = await GroupResource.makeNew({
      name: `Group for space ${name}`,
      workspaceId: workspace.id,
      kind: "regular",
    });

    return SpaceResource.makeNew(
      {
        name,
        kind: "regular",
        workspaceId: workspace.id,
      },
      [group]
    );
  }

  static async conversations(workspace: WorkspaceType) {
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "conversations",
        workspaceId: workspace.id,
      },
      []
    );
  }
}
