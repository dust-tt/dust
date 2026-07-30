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
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "global",
        workspaceId: workspace.id,
      },
      { members: removeNulls([globalGroup]) }, // TODO: Add groups
      undefined,
      auth
    );
  }

  static async system(workspace: WorkspaceType, systemGroup?: GroupResource) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "system",
        workspaceId: workspace.id,
      },
      { members: removeNulls([systemGroup]) }, // TODO: Add groups
      undefined,
      auth
    );
  }

  static async regular(workspace: WorkspaceType) {
    const name = "space " + faker.string.alphanumeric(8);
    const group = await GroupResource.makeNew({
      name: `${SPACE_GROUP_PREFIX} ${name}`,
      workspaceId: workspace.id,
      kind: "regular_auto",
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    return SpaceResource.makeNew(
      {
        name,
        kind: "regular",
        workspaceId: workspace.id,
      },
      { members: [group] },
      undefined,
      auth
    );
  }

  static async conversations(workspace: WorkspaceType) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "conversations",
        workspaceId: workspace.id,
      },
      { members: [] },
      undefined,
      auth
    );
  }

  static async project(workspace: WorkspaceType, creatorId?: number) {
    const name = "project " + faker.string.alphanumeric(8);
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
        kind: "space_editors",
      },
      {
        memberIds: [creatorId ?? defaultCreator.id],
      }
    );

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    return SpaceResource.makeNew(
      {
        name,
        kind: "project",
        workspaceId: workspace.id,
      },
      { members: [group], editors: [editorGroup] },
      undefined,
      auth
    );
  }
}
