import { beforeEach, describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types";

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

  describe("updateMetadata", () => {
    it("updates fields and persists changes", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "Initial",
        }
      );

      await metadata.updateMetadata({
        description: "Updated",
      });

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
    });
  });
});
