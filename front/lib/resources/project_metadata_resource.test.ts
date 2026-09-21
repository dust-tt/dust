import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { DEFAULT_POD_FILE_TAB_ICON } from "@app/types/pod_file_tab";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("ProjectMetadataResource", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let projectSpace: SpaceResource;
  let regularSpace: SpaceResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    projectSpace = await SpaceFactory.project(workspace);
    regularSpace = await SpaceFactory.regular(workspace);
  });

  describe("fetchBySpace", () => {
    it("returns null for non-project spaces", async () => {
      const metadata = await ProjectMetadataResource.fetchBySpace(
        auth,
        regularSpace
      );
      expect(metadata).toBeNull();
    });

    it("returns metadata when it exists", async () => {
      await ProjectMetadataResource.makeNew(auth, projectSpace, {
        description: "Test",
      });

      const metadata = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(metadata).not.toBeNull();
      expect(metadata!.description).toBe("Test");
    });
  });

  describe("makeNew", () => {
    it("creates metadata with provided values", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "Full metadata",
        }
      );

      expect(metadata.description).toBe("Full metadata");
      expect(metadata.sId).toMatch(/^pmd_/);
    });
  });

  describe("updateDescription", () => {
    it("updates fields and persists changes", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "Initial",
        }
      );

      await metadata.updateDescription("Updated");

      const updated = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(updated!.description).toBe("Updated");
    });
  });

  describe("delete", () => {
    it("removes metadata", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "To delete",
        }
      );

      await metadata.delete(auth, {});

      const deleted = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(deleted).toBeNull();
    });
  });

  describe("toJSON", () => {
    it("serializes correctly", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "JSON test",
        }
      );

      const json = metadata.toJSON();

      expect(json.sId).toMatch(/^pmd_/);
      expect(json.spaceId).toBe(projectSpace.sId);
      expect(json.description).toBe("JSON test");
      expect(typeof json.createdAt).toBe("number");
      expect(json.todoGenerationEnabled).toBe(false);
      expect(json.lastTodoAnalysisAt).toBeNull();
      expect(json.pinnedFramePath).toBeNull();
      expect(json.frameTabs).toEqual([]);
      expect(json.tabsOrder).toEqual(["conversations", "files", "tasks"]);
      expect(json.defaultSkillIds).toEqual([]);
    });
  });

  describe("default skills", () => {
    it("persists, loads (sIds), replaces, and clears default skills (custom + global)", async () => {
      // Needs a user-backed auth so SkillFactory can record an editor.
      const { workspace: skillWorkspace, authenticator } =
        await createResourceTest({ role: "admin" });
      const space = await SpaceFactory.project(skillWorkspace);
      const skillA = await SkillFactory.create(authenticator, { name: "A" });
      const skillB = await SkillFactory.create(authenticator, { name: "B" });
      // A code-defined global skill — stored via globalSkillId
      const [globalSkill] = await SkillResource.fetchByIds(authenticator, [
        "frames",
      ]);
      expect(globalSkill).toBeDefined();

      const metadata = await ProjectMetadataResource.makeNew(
        authenticator,
        space,
        { description: "d" }
      );

      await metadata.setDefaultSkills([skillA, skillB, globalSkill]);

      const reloaded = await ProjectMetadataResource.fetchBySpace(
        authenticator,
        space
      );
      expect([...reloaded!.defaultSkillIds].sort()).toEqual(
        [skillA.sId, skillB.sId, globalSkill.sId].sort()
      );
      // toJSON surfaces the same sIds for the front-end.
      expect([...reloaded!.toJSON().defaultSkillIds].sort()).toEqual(
        [skillA.sId, skillB.sId, globalSkill.sId].sort()
      );

      // Full replacement drops the omitted skills (keep only the global one).
      await metadata.setDefaultSkills([globalSkill]);
      const afterReplace = await ProjectMetadataResource.fetchBySpace(
        authenticator,
        space
      );
      expect(afterReplace!.defaultSkillIds).toEqual([globalSkill.sId]);

      // Empty set clears everything and stores null.
      await metadata.setDefaultSkills([]);
      const afterClear = await ProjectMetadataResource.fetchBySpace(
        authenticator,
        space
      );
      expect(afterClear!.defaultSkillIds).toEqual([]);
      expect(afterClear!.defaultSkillsIds).toBeNull();
    });

    it("persists space-scoped skills as is, trusting the caller to have validated access", async () => {
      const { workspace: skillWorkspace, authenticator } =
        await createResourceTest({ role: "admin" });
      const space = await SpaceFactory.project(skillWorkspace);

      const globalSkill = await SkillFactory.create(authenticator, {
        name: "global",
      });
      const podScopedSkill = await SkillFactory.create(authenticator, {
        name: "pod-scoped",
        requestedSpaceIds: [space.id],
      });

      const metadata = await ProjectMetadataResource.makeNew(
        authenticator,
        space,
        { description: "d" }
      );

      await metadata.setDefaultSkills([globalSkill, podScopedSkill]);

      const reloaded = await ProjectMetadataResource.fetchBySpace(
        authenticator,
        space
      );
      expect([...reloaded!.defaultSkillIds].sort()).toEqual(
        [globalSkill.sId, podScopedSkill.sId].sort()
      );
    });

    it("de-duplicates skills", async () => {
      const { workspace: skillWorkspace, authenticator } =
        await createResourceTest({ role: "admin" });
      const space = await SpaceFactory.project(skillWorkspace);
      const skill = await SkillFactory.create(authenticator, { name: "A" });

      const metadata = await ProjectMetadataResource.makeNew(
        authenticator,
        space,
        { description: "d" }
      );

      // The (workspace, project, skill) unique index would reject a duplicate;
      // setDefaultSkills de-dupes before inserting.
      await metadata.setDefaultSkills([skill, skill]);

      const reloaded = await ProjectMetadataResource.fetchBySpace(
        authenticator,
        space
      );
      expect(reloaded!.defaultSkillIds).toEqual([skill.sId]);
    });

    it("removes default skill mappings when the project is deleted", async () => {
      const { workspace: skillWorkspace, authenticator } =
        await createResourceTest({ role: "admin" });
      const space = await SpaceFactory.project(skillWorkspace);
      const skill = await SkillFactory.create(authenticator, { name: "A" });

      const metadata = await ProjectMetadataResource.makeNew(
        authenticator,
        space,
        { description: "d" }
      );
      await metadata.setDefaultSkills([skill]);

      const result = await metadata.delete(authenticator, {});
      expect(result.isOk()).toBe(true);

      const deleted = await ProjectMetadataResource.fetchBySpace(
        authenticator,
        space
      );
      expect(deleted).toBeNull();
    });

    it("removes default skill mappings when the custom skill is deleted", async () => {
      const { workspace: skillWorkspace, authenticator } =
        await createResourceTest({ role: "admin" });
      const space = await SpaceFactory.project(skillWorkspace);
      const skill = await SkillFactory.create(authenticator, { name: "A" });

      const metadata = await ProjectMetadataResource.makeNew(
        authenticator,
        space,
        { description: "d" }
      );
      await metadata.setDefaultSkills([skill]);

      const result = await skill.delete(authenticator);
      expect(result.isOk()).toBe(true);

      const reloaded = await ProjectMetadataResource.fetchBySpace(
        authenticator,
        space
      );
      expect(reloaded!.defaultSkillIds).toEqual([]);
      expect(reloaded!.defaultSkillsIds).toBeNull();
    });
  });
  describe("renameFramePath", () => {
    const oldPath = "pod-p1/Status/manifest.json";
    const newPath = "pod-p1/Health/manifest.json";

    it("follows a renamed Frame across the pin, tabs and tab order", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        { description: "d" }
      );
      await metadata.updatePinnedFramePath(oldPath);
      await metadata.updateFileTabs(
        [
          { path: oldPath, title: "Status", icon: DEFAULT_POD_FILE_TAB_ICON },
          {
            path: "pod-p1/notes.md",
            title: "My notes",
            icon: DEFAULT_POD_FILE_TAB_ICON,
          },
        ],
        [oldPath, "files", "pod-p1/notes.md"]
      );

      await metadata.renameFramePath(oldPath, newPath);

      expect(metadata.pinnedFramePath).toBe(newPath);
      expect(metadata.frameTabs?.map((tab) => tab.path)).toEqual([
        newPath,
        "pod-p1/notes.md",
      ]);
      expect(metadata.frameTabs?.[0].title).toBe("Health");
      expect(metadata.tabsOrder).toEqual([newPath, "files", "pod-p1/notes.md"]);
    });

    it("keeps a tab title the user customized", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        { description: "d" }
      );
      await metadata.updateFileTabs(
        [
          {
            path: oldPath,
            title: "Ops board",
            icon: DEFAULT_POD_FILE_TAB_ICON,
          },
        ],
        [oldPath]
      );

      await metadata.renameFramePath(oldPath, newPath);

      expect(metadata.frameTabs?.[0].title).toBe("Ops board");
      expect(metadata.frameTabs?.[0].path).toBe(newPath);
    });

    it("follows the rename for a seeded title whose folder name contains a dot", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        { description: "d" }
      );
      const dottedOld = "pod-p1/v1.2 Board/manifest.json";
      const dottedNew = "pod-p1/v2.0 Board/manifest.json";
      // Seeding strips the last extension, so this tab's title is "v1", not "v1.2 Board".
      await metadata.updateFileTabs(
        [{ path: dottedOld, title: "v1", icon: DEFAULT_POD_FILE_TAB_ICON }],
        [dottedOld]
      );

      await metadata.renameFramePath(dottedOld, dottedNew);

      expect(metadata.frameTabs?.[0].path).toBe(dottedNew);
      expect(metadata.frameTabs?.[0].title).toBe("v2");
    });

    it("leaves an unrelated Frame's pin and tabs alone", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        { description: "d" }
      );
      const otherPath = "pod-p1/Other/manifest.json";
      await metadata.updatePinnedFramePath(otherPath);
      await metadata.updateFileTabs(
        [{ path: otherPath, title: "Other", icon: DEFAULT_POD_FILE_TAB_ICON }],
        [otherPath]
      );

      await metadata.renameFramePath(oldPath, newPath);

      expect(metadata.pinnedFramePath).toBe(otherPath);
      expect(metadata.frameTabs?.[0].path).toBe(otherPath);
      expect(metadata.tabsOrder).toEqual([otherPath]);
    });
  });
});
