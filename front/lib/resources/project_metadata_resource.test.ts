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

  describe("renameFramePath", () => {
    it("repoints the pinned Frame, file tabs and tabs order", async () => {
      const fromPath = "pod-abc/Status/manifest.json";
      const toPath = "pod-abc/Renamed/manifest.json";
      const otherPath = "pod-abc/Other/manifest.json";
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          pinnedFramePath: fromPath,
          frameTabs: [
            {
              path: fromPath,
              title: "Status",
              icon: DEFAULT_POD_FILE_TAB_ICON,
            },
            {
              path: otherPath,
              title: "Other",
              icon: DEFAULT_POD_FILE_TAB_ICON,
            },
          ],
          tabsOrder: ["files", fromPath, otherPath],
        }
      );

      await metadata.renameFramePath(fromPath, toPath);

      const reloaded = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(reloaded?.pinnedFramePath).toBe(toPath);
      expect(reloaded?.frameTabs?.map((tab) => tab.path)).toEqual([
        toPath,
        otherPath,
      ]);
      expect(reloaded?.tabsOrder).toEqual(["files", toPath, otherPath]);
    });

    it("leaves metadata referencing other Frames untouched", async () => {
      const otherPath = "pod-abc/Other/manifest.json";
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          pinnedFramePath: otherPath,
          frameTabs: [
            {
              path: otherPath,
              title: "Other",
              icon: DEFAULT_POD_FILE_TAB_ICON,
            },
          ],
          tabsOrder: ["files", otherPath],
        }
      );

      await metadata.renameFramePath(
        "pod-abc/Status/manifest.json",
        "pod-abc/Renamed/manifest.json"
      );

      const reloaded = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(reloaded?.pinnedFramePath).toBe(otherPath);
      expect(reloaded?.frameTabs?.map((tab) => tab.path)).toEqual([otherPath]);
      expect(reloaded?.tabsOrder).toEqual(["files", otherPath]);
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
      expect(json.tabsOrder).toEqual([
        "conversations",
        "tasks",
        "files",
        "connected_data",
      ]);
      expect(json.defaultSkillIds).toEqual([]);
      expect(json.isAdminControlled).toBe(false);
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
});
