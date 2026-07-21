import { getRedisCacheClient } from "@app/lib/api/redis";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceEditorResource } from "@app/lib/resources/group_space_editor_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import {
  fetchGroupSpacesCachedForVaults,
  groupSpacesCacheDataKey,
  groupSpacesCacheVersionKey,
} from "@app/lib/resources/group_space_resource";
import { GroupSpaceViewerResource } from "@app/lib/resources/group_space_viewer_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Op } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
        kind: "regular_auto",
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
        kind: "regular_auto",
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
        kind: "regular_auto",
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
        kind: "regular_auto",
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
        kind: "regular_auto",
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

describe("group_vaults cache invalidation hooks", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;

  async function getIncrSpy() {
    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });
    return vi.mocked(redisCli.incr);
  }

  async function resetInvalidationSpy(): Promise<void> {
    (await getIncrSpy()).mockClear();
    vi.mocked(invalidateCacheAfterCommit).mockClear();
  }

  async function wasInvalidated(workspaceId: number): Promise<boolean> {
    const incrSpy = await getIncrSpy();
    return incrSpy.mock.calls.some(
      (call) => call[0] === groupSpacesCacheVersionKey(workspaceId)
    );
  }

  async function expectInvalidated(workspaceId: number): Promise<void> {
    await vi.waitFor(async () => {
      expect(await wasInvalidated(workspaceId)).toBe(true);
    });
  }

  async function expectNotInvalidated(workspaceId: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await wasInvalidated(workspaceId)).toBe(false);
  }

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();
    await GroupFactory.defaults(workspace);
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );
  });

  it("invalidates on direct create", async () => {
    const space = await SpaceFactory.regular(workspace);
    const group = await GroupResource.makeNew({
      name: "Extra group",
      workspaceId: workspace.id,
      kind: "regular_manual",
    });
    await resetInvalidationSpy();

    await GroupSpaceFactory.associate(space, group);

    await expectInvalidated(workspace.id);
  });

  it("invalidates on SpaceResource.makeNew, after its transaction commits", async () => {
    const group = await GroupResource.makeNew({
      name: "Space group",
      workspaceId: workspace.id,
      kind: "regular_auto",
    });
    await resetInvalidationSpy();

    await SpaceResource.makeNew(
      { name: "New space", kind: "regular", workspaceId: workspace.id },
      { members: [group] }
    );

    await expectInvalidated(workspace.id);
  });

  it("invalidates on bulkCreate", async () => {
    const space = await SpaceFactory.regular(workspace);
    const group = await GroupResource.makeNew({
      name: "Bulk group",
      workspaceId: workspace.id,
      kind: "regular_manual",
    });
    await resetInvalidationSpy();

    await GroupSpaceModel.bulkCreate([
      {
        groupId: group.id,
        vaultId: space.id,
        workspaceId: workspace.id,
        kind: "member",
      },
    ]);

    await expectInvalidated(workspace.id);
  });

  it("invalidates on bulk destroy scoped by workspaceId", async () => {
    const space = await SpaceFactory.regular(workspace);
    await resetInvalidationSpy();

    await GroupSpaceModel.destroy({
      where: { vaultId: space.id, workspaceId: workspace.id },
    });

    await expectInvalidated(workspace.id);
  });

  it("invalidates when a space is deleted through the resource", async () => {
    const space = await SpaceFactory.regular(workspace);
    await resetInvalidationSpy();

    const result = await space.delete(auth, { hardDelete: true });

    expect(result.isOk()).toBe(true);
    await expectInvalidated(workspace.id);
  });

  it("invalidates when a group is deleted (its associations are destroyed)", async () => {
    const space = await SpaceFactory.regular(workspace);
    const group = await GroupResource.makeNew({
      name: "Doomed group",
      workspaceId: workspace.id,
      kind: "regular_manual",
    });
    await GroupSpaceFactory.associate(space, group);
    await resetInvalidationSpy();

    const result = await group.delete(auth);

    expect(result.isOk()).toBe(true);
    await expectInvalidated(workspace.id);
  });

  it("invalidates on group rename (names are cached)", async () => {
    const space = await SpaceFactory.regular(workspace);
    const group = await GroupResource.makeNew({
      name: "Old name",
      workspaceId: workspace.id,
      kind: "regular_manual",
    });
    await GroupSpaceFactory.associate(space, group);
    await resetInvalidationSpy();

    await group.updateName(auth, "New name");

    await expectInvalidated(workspace.id);
  });

  it("accepts an Op.in workspaceId shape on bulk update", async () => {
    const space = await SpaceFactory.regular(workspace);
    await resetInvalidationSpy();

    await GroupSpaceModel.update(
      { kind: "member" },
      {
        where: {
          vaultId: space.id,
          workspaceId: { [Op.in]: [workspace.id] },
        },
      }
    );

    await expectInvalidated(workspace.id);
  });

  it("forwards the ambient transaction to invalidateCacheAfterCommit", async () => {
    const space = await SpaceFactory.regular(workspace);
    const group = await GroupResource.makeNew({
      name: "Tx group",
      workspaceId: workspace.id,
      kind: "regular_manual",
    });
    await resetInvalidationSpy();

    await GroupSpaceFactory.associate(space, group);

    const calls = vi.mocked(invalidateCacheAfterCommit).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)?.[0]).toBeTruthy();
  });

  it("refuses a bulk update whose where clause has no workspaceId", async () => {
    const space = await SpaceFactory.regular(workspace);

    await expect(
      GroupSpaceModel.update(
        { kind: "member" },
        { where: { vaultId: space.id } }
      )
    ).rejects.toThrow(/cannot derive workspaceId/);
  });

  it("refuses a bulk update with a non-numeric workspaceId shape", async () => {
    const space = await SpaceFactory.regular(workspace);

    await expect(
      GroupSpaceModel.update(
        { kind: "member" },
        {
          where: {
            vaultId: space.id,
            workspaceId: { [Op.gt]: 0 },
          },
        }
      )
    ).rejects.toThrow(/cannot derive workspaceId/);
  });

  it("only invalidates the mutated workspace", async () => {
    const otherWorkspace = await WorkspaceFactory.basic();
    const space = await SpaceFactory.regular(workspace);
    const group = await GroupResource.makeNew({
      name: "Isolated group",
      workspaceId: workspace.id,
      kind: "regular_manual",
    });
    await resetInvalidationSpy();

    await GroupSpaceFactory.associate(space, group);

    await expectInvalidated(workspace.id);
    await expectNotInvalidated(otherWorkspace.id);
  });
});

describe("fetchGroupSpacesCachedForVaults", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;

  async function getHashSpies() {
    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });
    return {
      get: vi.mocked(redisCli.get),
      hSet: vi.mocked(redisCli.hSet),
      hmGet: vi.mocked(redisCli.hmGet),
    };
  }

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();
    await GroupFactory.defaults(workspace);
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const spies = await getHashSpies();
    spies.get.mockClear();
    spies.hSet.mockClear();
    spies.hmGet.mockClear();
  });

  it("returns an empty map for no vault ids", async () => {
    const result = await fetchGroupSpacesCachedForVaults(workspace.id, []);
    expect(result.size).toBe(0);
  });

  it("populates the versioned hash on miss and returns DB rows", async () => {
    const space = await SpaceFactory.regular(workspace);

    const result = await fetchGroupSpacesCachedForVaults(workspace.id, [
      space.id,
    ]);

    const rows = result.get(space.id);
    expect(rows?.length).toBeGreaterThan(0);
    expect(rows?.[0].group.id).toBe(rows?.[0].groupSpace.groupId);

    const spies = await getHashSpies();
    const setCall = spies.hSet.mock.calls.at(-1);
    expect(setCall?.[0]).toBe(groupSpacesCacheDataKey(workspace.id, 1));
    const written = setCall?.[1];
    expect(written).toHaveProperty("_");
    expect(written).toHaveProperty(String(space.id));
  });

  it("serves from the hash on hit without writing", async () => {
    const spies = await getHashSpies();
    const cachedRow = {
      groupSpace: {
        id: 1,
        kind: "member",
        vaultId: 42,
        groupId: 7,
        workspaceId: workspace.id,
        createdAtMs: 1000,
        updatedAtMs: 2000,
      },
      group: {
        id: 7,
        name: "From cache",
        kind: "regular_auto",
        workOSGroupId: null,
        poolCapAwuCredits: null,
        workspaceId: workspace.id,
        createdAtMs: 1000,
        updatedAtMs: 2000,
      },
    };
    spies.get.mockResolvedValueOnce("3");
    spies.hmGet.mockResolvedValueOnce(["1", JSON.stringify([cachedRow])]);

    const result = await fetchGroupSpacesCachedForVaults(workspace.id, [42]);

    expect(result.get(42)?.[0].group.name).toBe("From cache");
    expect(result.get(42)?.[0].group.createdAt).toEqual(new Date(1000));
    expect(spies.hSet).not.toHaveBeenCalled();
  });

  it("treats a missing field on a populated hash as no groups", async () => {
    const spies = await getHashSpies();
    spies.get.mockResolvedValueOnce("3");
    spies.hmGet.mockResolvedValueOnce(["1", null]);

    const result = await fetchGroupSpacesCachedForVaults(workspace.id, [42]);

    expect(result.get(42)).toEqual([]);
    expect(spies.hSet).not.toHaveBeenCalled();
  });

  it("treats an unparseable field as a miss and repopulates", async () => {
    const space = await SpaceFactory.regular(workspace);
    const spies = await getHashSpies();
    spies.get.mockResolvedValueOnce("3");
    spies.hmGet.mockResolvedValueOnce([
      "1",
      JSON.stringify([{ garbage: true }]),
    ]);

    const result = await fetchGroupSpacesCachedForVaults(workspace.id, [
      space.id,
    ]);

    expect(result.get(space.id)?.length).toBeGreaterThan(0);
    expect(spies.hSet).toHaveBeenCalled();
  });
});

describe("SpaceResource cache path equivalence", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();
    await GroupFactory.defaults(workspace);
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    await SpaceFactory.defaults(auth);
    await SpaceFactory.regular(workspace);

    const memberGroup = await GroupResource.makeNew({
      name: "Project members",
      workspaceId: workspace.id,
      kind: "regular_auto",
    });
    const editorGroup = await GroupResource.makeNew({
      name: "Project editors",
      workspaceId: workspace.id,
      kind: "space_editors",
    });
    await SpaceResource.makeNew(
      { name: "Project", kind: "project", workspaceId: workspace.id },
      { members: [memberGroup], editors: [editorGroup] }
    );
  });

  function normalize(spaces: SpaceResource[]) {
    return [...spaces]
      .sort((a, b) => a.id - b.id)
      .map((s) => ({
        sId: s.sId,
        kind: s.kind,
        name: s.name,
        isOpen: s.isOpen(),
        isMember: s.isMember(auth),
        canRead: s.canRead(auth),
        canWrite: s.canWrite(auth),
        canAdministrate: s.canAdministrate(auth),
        groupIds: [...s.toJSON().groupIds].sort(),
        groups: [...s.groups]
          .sort((a, b) => a.id - b.id)
          .map((g) => ({
            id: g.id,
            name: g.name,
            kind: g.kind,
            groupSpaceKind: g.group_vaults?.kind ?? null,
          })),
      }));
  }

  it("returns the same spaces and groups as the join path", async () => {
    const cachePath = await SpaceResource.listWorkspaceSpacesAsMember(auth);

    await KillSwitchResource.enableKillSwitch(
      "global_disable_group_vaults_cache"
    );
    const joinPath = await SpaceResource.listWorkspaceSpacesAsMember(auth);
    await KillSwitchResource.disableKillSwitch(
      "global_disable_group_vaults_cache"
    );

    expect(cachePath.length).toBeGreaterThan(0);
    expect(normalize(cachePath)).toEqual(normalize(joinPath));
  });

  it("returns the same system space as the join path", async () => {
    const cachePath = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    await KillSwitchResource.enableKillSwitch(
      "global_disable_group_vaults_cache"
    );
    const joinPath = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    await KillSwitchResource.disableKillSwitch(
      "global_disable_group_vaults_cache"
    );

    expect(normalize([cachePath])).toEqual(normalize([joinPath]));
  });

  it("returns the same project permissions as the join path", async () => {
    const cachePath = await SpaceResource.listProjectSpaces(auth);

    await KillSwitchResource.enableKillSwitch(
      "global_disable_group_vaults_cache"
    );
    const joinPath = await SpaceResource.listProjectSpaces(auth);
    await KillSwitchResource.disableKillSwitch(
      "global_disable_group_vaults_cache"
    );

    expect(cachePath.length).toBeGreaterThan(0);
    expect(normalize(cachePath)).toEqual(normalize(joinPath));
    const project = cachePath.find((s) => s.kind === "project");
    expect(
      project?.groups.some((g) => g.group_vaults?.kind === "project_editor")
    ).toBe(true);
  });
});
