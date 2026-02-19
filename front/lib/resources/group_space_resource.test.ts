import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceEditorResource } from "@app/lib/resources/group_space_editor_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import { GroupSpaceViewerResource } from "@app/lib/resources/group_space_viewer_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("GroupSpaceMemberResource", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let regularSpace: SpaceResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();

    // Create default groups (including global group)
    await GroupFactory.defaults(workspace);

    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });

    auth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    regularSpace = await SpaceFactory.regular(workspace);
  });

  describe("makeNew", () => {
    it("should create a new GroupSpaceMemberResource with correct properties", async () => {
      const testGroup = await GroupResource.makeNew({
        name: "Test Group",
        workspaceId: workspace.id,
        kind: "regular",
      });

      const groupSpaceMember = await GroupSpaceMemberResource.makeNew(auth, {
        group: testGroup,
        space: regularSpace,
      });

      expect(groupSpaceMember).toBeInstanceOf(GroupSpaceMemberResource);
      expect(groupSpaceMember.groupId).toBe(testGroup.id);
      expect(groupSpaceMember.vaultId).toBe(regularSpace.id);
      expect(groupSpaceMember.workspaceId).toBe(workspace.id);
      expect(groupSpaceMember.kind).toBe("member");
    });
  });

  describe("fetchBySpace", () => {
    it("should return empty array when no member GroupSpace exists for the space", async () => {
      // Create a space without any member groups
      const emptySpace = await SpaceResource.makeNew(
        {
          name: "Empty Space",
          kind: "regular",
          workspaceId: workspace.id,
        },
        { members: [] }
      );

      const result = await GroupSpaceMemberResource.fetchBySpace({
        space: emptySpace,
        filterOnManagementMode: false,
      });

      expect(result).toEqual([]);
    });

    it("should fetch an existing GroupSpaceMemberResource by space", async () => {
      // regularSpace already has a member group from SpaceFactory.regular
      // Let's fetch it
      const result = await GroupSpaceMemberResource.fetchBySpace({
        space: regularSpace,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toBeInstanceOf(GroupSpaceMemberResource);
      expect(result[0]?.vaultId).toBe(regularSpace.id);
      expect(result[0]?.kind).toBe("member");
      // The group should be the one created by SpaceFactory
      expect(result[0]?.groupId).toBeDefined();
    });

    // Note: Testing the assertion "Group must exist for member group space" is not possible
    // in this test environment due to database foreign key constraints that prevent
    // creating orphaned GroupSpace records. The assertion is still valid in production
    // if data integrity issues occur.
  });
});

describe("GroupSpaceEditorResource", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let projectSpace: SpaceResource;
  let editorGroup: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();

    // Create default groups (including global group)
    await GroupFactory.defaults(workspace);

    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });

    auth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    // Create a project space
    projectSpace = await SpaceFactory.project(workspace);

    // Create an editor group
    editorGroup = await GroupResource.makeNew({
      name: "Test Editor Group",
      workspaceId: workspace.id,
      kind: "space_editors",
    });
  });

  describe("makeNew", () => {
    it("should throw an assertion error when space is not a project space", async () => {
      const regularSpace = await SpaceFactory.regular(workspace);

      await expect(
        GroupSpaceEditorResource.makeNew(auth, {
          group: editorGroup,
          space: regularSpace,
        })
      ).rejects.toThrow("Editor groups only apply to project spaces");
    });

    it("should throw an assertion error when group is not a space editor or provisioned group", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Regular Group",
        workspaceId: workspace.id,
        kind: "regular",
      });

      await expect(
        GroupSpaceEditorResource.makeNew(auth, {
          group: regularGroup,
          space: projectSpace,
        })
      ).rejects.toThrow(
        "Only space editor or provisioned groups can be an editor group"
      );
    });

    it("should allow creating editor resource with provisioned group", async () => {
      const provisionedGroup = await GroupResource.makeNew({
        name: "Provisioned Group",
        workspaceId: workspace.id,
        kind: "provisioned",
      });

      const groupSpaceEditor = await GroupSpaceEditorResource.makeNew(auth, {
        group: provisionedGroup,
        space: projectSpace,
      });

      expect(groupSpaceEditor).toBeInstanceOf(GroupSpaceEditorResource);
      expect(groupSpaceEditor.kind).toBe("project_editor");
    });
  });

  describe("fetchBySpace", () => {
    it("should return the existing editor group space for a project", async () => {
      const result = await GroupSpaceEditorResource.fetchBySpace({
        space: projectSpace,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toBeInstanceOf(GroupSpaceEditorResource);
      expect(result[0]?.vaultId).toBe(projectSpace.id);
      expect(result[0]?.kind).toBe("project_editor");
    });

    it("should return empty array when no editor GroupSpace exists for the project", async () => {
      // Delete existing editor group spaces
      await GroupSpaceModel.destroy({
        where: {
          vaultId: projectSpace.id,
          kind: "project_editor",
          workspaceId: workspace.id,
        },
      });

      const result = await GroupSpaceEditorResource.fetchBySpace({
        space: projectSpace,
      });

      expect(result).toEqual([]);
    });

    it("should throw an assertion error when space is not a project space", async () => {
      const regularSpace = await SpaceFactory.regular(workspace);

      await expect(
        GroupSpaceEditorResource.fetchBySpace({ space: regularSpace })
      ).rejects.toThrow("Editor groups only apply to project spaces");
    });

    // Note: Testing the assertion "Group must exist for editor group space" is not possible
    // in this test environment due to database foreign key constraints that prevent
    // creating orphaned GroupSpace records. The assertion is still valid in production
    // if data integrity issues occur.

    it("should throw an assertion error when group is not matching the management mode", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Regular Group",
        workspaceId: workspace.id,
        kind: "regular",
      });

      // Delete existing editor groups
      await GroupSpaceModel.destroy({
        where: {
          vaultId: projectSpace.id,
          kind: "project_editor",
          workspaceId: workspace.id,
        },
      });

      // Create a GroupSpaceModel with a non-editor group
      await GroupSpaceModel.create({
        groupId: regularGroup.id,
        vaultId: projectSpace.id,
        workspaceId: workspace.id,
        kind: "project_editor",
      });

      // When filtering on management mode, the group won't be found because it doesn't match the expected kind
      await expect(
        GroupSpaceEditorResource.fetchBySpace({
          space: projectSpace,
        })
      ).rejects.toThrow(
        "Only space_editors or provisioned groups can be editor groups"
      );
    });
  });
});

describe("GroupSpaceViewerResource", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let projectSpace: SpaceResource;
  let globalGroup: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();

    // Create default groups (including global group)
    const { globalGroup: gGroup } = await GroupFactory.defaults(workspace);
    globalGroup = gGroup;

    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });

    auth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    // Create a project space
    projectSpace = await SpaceFactory.project(workspace);
  });

  describe("makeNew", () => {
    it("should throw an assertion error when space is not a project space", async () => {
      const regularSpace = await SpaceFactory.regular(workspace);

      await expect(
        GroupSpaceViewerResource.makeNew(auth, {
          group: globalGroup,
          space: regularSpace,
        })
      ).rejects.toThrow("Viewer groups only apply to project spaces");
    });

    it("should throw an assertion error when group is not the global group", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Regular Group",
        workspaceId: workspace.id,
        kind: "regular",
      });

      await expect(
        GroupSpaceViewerResource.makeNew(auth, {
          group: regularGroup,
          space: projectSpace,
        })
      ).rejects.toThrow("Only the global group can be a viewer group");
    });
  });

  describe("fetchBySpace", () => {
    it("should return null when no viewer GroupSpace exists for the project", async () => {
      const result = await GroupSpaceViewerResource.fetchBySpace({
        space: projectSpace,
      });

      expect(result).toBeNull();
    });

    it("should fetch an existing GroupSpaceViewerResource by space", async () => {
      await GroupSpaceViewerResource.makeNew(auth, {
        group: globalGroup,
        space: projectSpace,
      });

      const result = await GroupSpaceViewerResource.fetchBySpace({
        space: projectSpace,
      });

      expect(result).toBeInstanceOf(GroupSpaceViewerResource);
      expect(result?.groupId).toBe(globalGroup.id);
      expect(result?.vaultId).toBe(projectSpace.id);
      expect(result?.kind).toBe("project_viewer");
    });

    it("should throw an assertion error when space is not a project space", async () => {
      const regularSpace = await SpaceFactory.regular(workspace);

      await expect(
        GroupSpaceViewerResource.fetchBySpace({
          space: regularSpace,
        })
      ).rejects.toThrow("Viewer groups only apply to project spaces");
    });

    // Note: Testing the assertion "Group must exist for viewer group space" is not possible
    // in this test environment due to database foreign key constraints that prevent
    // creating orphaned GroupSpace records. The assertion is still valid in production
    // if data integrity issues occur.

    it("should throw an assertion error when group is not the global group", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Regular Group",
        workspaceId: workspace.id,
        kind: "regular",
      });

      // Create a GroupSpaceModel with a non-global group
      await GroupSpaceModel.create({
        groupId: regularGroup.id,
        vaultId: projectSpace.id,
        workspaceId: workspace.id,
        kind: "project_viewer",
      });

      await expect(
        GroupSpaceViewerResource.fetchBySpace({
          space: projectSpace,
        })
      ).rejects.toThrow("Only the global group can be a viewer group");
    });
  });
});
