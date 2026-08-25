import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import {
  PROJECT_EDITOR_GROUP_PREFIX,
  PROJECT_GROUP_PREFIX,
  SPACE_GROUP_PREFIX,
} from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";
import type { WorkspaceType } from "@app/types/user";
import { faker } from "@faker-js/faker";

export class SpaceFactory {
  // The factories take a `WorkspaceType`, not an `Authenticator`, but `SpaceResource.makeNew` needs
  // one to write the space's `group_permissions`. Building an internal admin here keeps every
  // factory-created space consistent with what production creates, without threading an auth
  // through ~150 test files.
  private static async internalAuth(workspace: WorkspaceType) {
    return Authenticator.internalAdminForWorkspace(workspace.sId);
  }
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
    // Production always attaches the workspace global group (see
    // `SpaceResource.makeDefaultsForWorkspace`), and that group's `reader` grant is what confers
    // read on the global space. Default to it so a factory-built global space is readable the same
    // way. `GroupFactory.defaults` reuses the workspace's existing groups.
    const group =
      globalGroup ?? (await GroupFactory.defaults(workspace)).globalGroup;

    return SpaceResource.makeNew(
      await this.internalAuth(workspace),
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "global",
        workspaceId: workspace.id,
      },
      { members: [group] }
    );
  }

  static async system(workspace: WorkspaceType, systemGroup?: GroupResource) {
    return SpaceResource.makeNew(
      await this.internalAuth(workspace),
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "system",
        workspaceId: workspace.id,
      },
      { members: removeNulls([systemGroup]) } // TODO: Add groups
    );
  }

  static async regular(workspace: WorkspaceType) {
    const name = "space " + faker.string.alphanumeric(8);
    const group = await GroupResource.makeNew({
      name: `${SPACE_GROUP_PREFIX} ${name}`,
      workspaceId: workspace.id,
      kind: "regular_auto",
    });

    return SpaceResource.makeNew(
      await this.internalAuth(workspace),
      {
        name,
        kind: "regular",
        workspaceId: workspace.id,
      },
      { members: [group] }
    );
  }

  static async conversations(workspace: WorkspaceType) {
    return SpaceResource.makeNew(
      await this.internalAuth(workspace),
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "conversations",
        workspaceId: workspace.id,
      },
      { members: [] }
    );
  }

  static async project(
    workspace: WorkspaceType,
    creatorId?: number,
    { name = "project " + faker.string.alphanumeric(8) }: { name?: string } = {}
  ) {
    const group = await GroupResource.makeNew({
      name: `${PROJECT_GROUP_PREFIX} ${name}`,
      workspaceId: workspace.id,
      kind: "regular_auto",
    });

    // Create an editor group with the creator as a member if creatorId is provided
    const defaultCreator = await UserFactory.basic();
    const editorGroup = await GroupResource.makeNew(
      {
        name: `${PROJECT_EDITOR_GROUP_PREFIX} ${name}`,
        workspaceId: workspace.id,
        kind: "regular_auto",
      },
      {
        memberIds: [creatorId ?? defaultCreator.id],
      }
    );

    return SpaceResource.makeNew(
      await this.internalAuth(workspace),
      {
        name,
        kind: "project",
        workspaceId: workspace.id,
      },
      { members: [group], editors: [editorGroup] }
    );
  }
}
