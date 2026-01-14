import { beforeEach, describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types";

describe("ProjectMetadataResource", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let projectSpace: SpaceResource;
  let regularSpace: SpaceResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();

    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Create a project space
    projectSpace = await SpaceFactory.project(workspace);

    // Create a regular space for comparison tests
    regularSpace = await SpaceFactory.regular(workspace);
  });

  describe("fetchBySpace", () => {
    it("should return null for a project space with no metadata", async () => {
      const metadata = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(metadata).toBeNull();
    });

    it("should return null for a regular space (not a project)", async () => {
      const metadata = await ProjectMetadataResource.fetchBySpace(
        auth,
        regularSpace
      );
      expect(metadata).toBeNull();
    });

    it("should return metadata after it has been created", async () => {
      // Create metadata
      await ProjectMetadataResource.makeNew(auth, projectSpace, {
        description: "Test description",
        urls: ["https://example.com"],
        tags: ["tag1", "tag2"],
        emoji: "rocket",
        color: "#FF0000",
      });

      // Fetch metadata
      const metadata = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(metadata).not.toBeNull();
      expect(metadata!.description).toBe("Test description");
      expect(metadata!.urls).toEqual(["https://example.com"]);
      expect(metadata!.tags).toEqual(["tag1", "tag2"]);
      expect(metadata!.emoji).toBe("rocket");
      expect(metadata!.color).toBe("#FF0000");
    });
  });

  describe("makeNew", () => {
    it("should create metadata with all fields", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "Full metadata",
          urls: ["https://github.com", "https://docs.example.com"],
          tags: ["frontend", "react", "typescript"],
          emoji: "sparkles",
          color: "#00FF00",
        }
      );

      expect(metadata).not.toBeNull();
      expect(metadata.description).toBe("Full metadata");
      expect(metadata.urls).toHaveLength(2);
      expect(metadata.urls).toContain("https://github.com");
      expect(metadata.urls).toContain("https://docs.example.com");
      expect(metadata.tags).toHaveLength(3);
      expect(metadata.tags).toContain("frontend");
      expect(metadata.tags).toContain("react");
      expect(metadata.tags).toContain("typescript");
      expect(metadata.emoji).toBe("sparkles");
      expect(metadata.color).toBe("#00FF00");
    });

    it("should create metadata with null description", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: null,
          urls: [],
          tags: [],
          emoji: null,
          color: null,
        }
      );

      expect(metadata).not.toBeNull();
      expect(metadata.description).toBeNull();
      expect(metadata.urls).toEqual([]);
      expect(metadata.tags).toEqual([]);
      expect(metadata.emoji).toBeNull();
      expect(metadata.color).toBeNull();
    });

    it("should create metadata with empty arrays for urls and tags", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "Test",
          urls: [],
          tags: [],
          emoji: null,
          color: null,
        }
      );

      expect(metadata.urls).toEqual([]);
      expect(metadata.tags).toEqual([]);
    });

    it("should handle unicode emoji values", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: null,
          urls: [],
          tags: [],
          emoji: "🚀",
          color: null,
        }
      );

      expect(metadata.emoji).toBe("🚀");
    });
  });

  describe("updateMetadata", () => {
    let existingMetadata: ProjectMetadataResource;

    beforeEach(async () => {
      existingMetadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "Initial description",
          urls: ["https://initial.com"],
          tags: ["initial"],
          emoji: "star",
          color: "#000000",
        }
      );
    });

    it("should update description only", async () => {
      const result = await existingMetadata.updateMetadata({
        description: "Updated description",
      });

      expect(result.isOk()).toBe(true);

      // Refetch to verify
      const updated = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(updated!.description).toBe("Updated description");
      // Other fields should remain unchanged
      expect(updated!.urls).toEqual(["https://initial.com"]);
      expect(updated!.tags).toEqual(["initial"]);
      expect(updated!.emoji).toBe("star");
      expect(updated!.color).toBe("#000000");
    });

    it("should update urls only", async () => {
      const newUrls = ["https://new1.com", "https://new2.com"];
      const result = await existingMetadata.updateMetadata({
        urls: newUrls,
      });

      expect(result.isOk()).toBe(true);

      const updated = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(updated!.urls).toEqual(newUrls);
      // Other fields should remain unchanged
      expect(updated!.description).toBe("Initial description");
    });

    it("should update tags only", async () => {
      const newTags = ["new", "tags", "here"];
      const result = await existingMetadata.updateMetadata({
        tags: newTags,
      });

      expect(result.isOk()).toBe(true);

      const updated = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(updated!.tags).toEqual(newTags);
    });

    it("should update emoji and color", async () => {
      const result = await existingMetadata.updateMetadata({
        emoji: "fire",
        color: "#FF5500",
      });

      expect(result.isOk()).toBe(true);

      const updated = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(updated!.emoji).toBe("fire");
      expect(updated!.color).toBe("#FF5500");
    });

    it("should set description to null", async () => {
      const result = await existingMetadata.updateMetadata({
        description: null,
      });

      expect(result.isOk()).toBe(true);

      const updated = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(updated!.description).toBeNull();
    });

    it("should set emoji and color to null", async () => {
      const result = await existingMetadata.updateMetadata({
        emoji: null,
        color: null,
      });

      expect(result.isOk()).toBe(true);

      const updated = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(updated!.emoji).toBeNull();
      expect(updated!.color).toBeNull();
    });

    it("should update multiple fields at once", async () => {
      const result = await existingMetadata.updateMetadata({
        description: "Completely new description",
        urls: ["https://brand-new.com"],
        tags: ["brand", "new"],
        emoji: "rocket",
        color: "#AABBCC",
      });

      expect(result.isOk()).toBe(true);

      const updated = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(updated!.description).toBe("Completely new description");
      expect(updated!.urls).toEqual(["https://brand-new.com"]);
      expect(updated!.tags).toEqual(["brand", "new"]);
      expect(updated!.emoji).toBe("rocket");
      expect(updated!.color).toBe("#AABBCC");
    });

    it("should clear arrays by setting to empty", async () => {
      const result = await existingMetadata.updateMetadata({
        urls: [],
        tags: [],
      });

      expect(result.isOk()).toBe(true);

      const updated = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(updated!.urls).toEqual([]);
      expect(updated!.tags).toEqual([]);
    });
  });

  describe("delete", () => {
    it("should delete metadata", async () => {
      // Create metadata first
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "To be deleted",
          urls: [],
          tags: [],
          emoji: null,
          color: null,
        }
      );

      // Verify it exists
      const beforeDelete = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(beforeDelete).not.toBeNull();

      // Delete it
      const result = await metadata.delete(auth, {});
      expect(result.isOk()).toBe(true);

      // Verify it's gone
      const afterDelete = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      expect(afterDelete).toBeNull();
    });
  });

  describe("toJSON", () => {
    it("should serialize metadata to JSON correctly", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "JSON test",
          urls: ["https://json.com"],
          tags: ["json", "test"],
          emoji: "json",
          color: "#123456",
        }
      );

      const json = metadata.toJSON();

      expect(json).toHaveProperty("sId");
      expect(typeof json.sId).toBe("string");
      expect(json.sId).toMatch(/^pmd_/); // Should start with project_metadata prefix

      expect(json).toHaveProperty("createdAt");
      expect(typeof json.createdAt).toBe("number");

      expect(json).toHaveProperty("updatedAt");
      expect(typeof json.updatedAt).toBe("number");

      expect(json).toHaveProperty("spaceId");
      expect(json.spaceId).toBe(projectSpace.sId);

      expect(json.description).toBe("JSON test");
      expect(json.urls).toEqual(["https://json.com"]);
      expect(json.tags).toEqual(["json", "test"]);
      expect(json.emoji).toBe("json");
      expect(json.color).toBe("#123456");
    });

    it("should handle null values in JSON serialization", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: null,
          urls: [],
          tags: [],
          emoji: null,
          color: null,
        }
      );

      const json = metadata.toJSON();

      expect(json.description).toBeNull();
      expect(json.urls).toEqual([]);
      expect(json.tags).toEqual([]);
      expect(json.emoji).toBeNull();
      expect(json.color).toBeNull();
    });
  });

  describe("sId generation", () => {
    it("should generate consistent sId based on id and workspaceId", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: null,
          urls: [],
          tags: [],
          emoji: null,
          color: null,
        }
      );

      const sId1 = metadata.sId;
      const sId2 = metadata.sId;

      expect(sId1).toBe(sId2);
      expect(sId1).toMatch(/^pmd_/);
    });

    it("should use modelIdToSId correctly", async () => {
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: null,
          urls: [],
          tags: [],
          emoji: null,
          color: null,
        }
      );

      const computedSId = ProjectMetadataResource.modelIdToSId({
        id: metadata.id,
        workspaceId: metadata.workspaceId,
      });

      expect(computedSId).toBe(metadata.sId);
    });
  });

  describe("edge cases", () => {
    it("should handle very long description", async () => {
      const longDescription = "a".repeat(10000);
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: longDescription,
          urls: [],
          tags: [],
          emoji: null,
          color: null,
        }
      );

      expect(metadata.description).toBe(longDescription);
    });

    it("should handle many URLs", async () => {
      const manyUrls = Array.from(
        { length: 100 },
        (_, i) => `https://url${i}.com`
      );
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: null,
          urls: manyUrls,
          tags: [],
          emoji: null,
          color: null,
        }
      );

      expect(metadata.urls).toHaveLength(100);
      expect(metadata.urls).toEqual(manyUrls);
    });

    it("should handle many tags", async () => {
      const manyTags = Array.from({ length: 50 }, (_, i) => `tag${i}`);
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: null,
          urls: [],
          tags: manyTags,
          emoji: null,
          color: null,
        }
      );

      expect(metadata.tags).toHaveLength(50);
      expect(metadata.tags).toEqual(manyTags);
    });

    it("should handle special characters in description", async () => {
      const specialDescription =
        "Test with special chars: <>&\"'`\\n\\t日本語🚀";
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: specialDescription,
          urls: [],
          tags: [],
          emoji: null,
          color: null,
        }
      );

      expect(metadata.description).toBe(specialDescription);
    });

    it("should handle URLs with special characters", async () => {
      const specialUrls = [
        "https://example.com/path?query=value&other=123",
        "https://example.com/path#fragment",
        "https://user:pass@example.com/path",
      ];
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: null,
          urls: specialUrls,
          tags: [],
          emoji: null,
          color: null,
        }
      );

      expect(metadata.urls).toEqual(specialUrls);
    });

    it("should handle tags with spaces and special characters", async () => {
      const specialTags = [
        "tag with spaces",
        "tag-with-dashes",
        "tag_with_underscores",
        "tag.with.dots",
        "日本語タグ",
      ];
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: null,
          urls: [],
          tags: specialTags,
          emoji: null,
          color: null,
        }
      );

      expect(metadata.tags).toEqual(specialTags);
    });
  });

  describe("multiple project spaces", () => {
    it("should handle metadata for different project spaces independently", async () => {
      // Create another project space
      const projectSpace2 = await SpaceFactory.project(workspace);

      // Create metadata for both spaces
      const metadata1 = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: "Project 1",
          urls: ["https://project1.com"],
          tags: ["p1"],
          emoji: "one",
          color: "#111111",
        }
      );

      const metadata2 = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace2,
        {
          description: "Project 2",
          urls: ["https://project2.com"],
          tags: ["p2"],
          emoji: "two",
          color: "#222222",
        }
      );

      // Verify they are independent
      const fetched1 = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace
      );
      const fetched2 = await ProjectMetadataResource.fetchBySpace(
        auth,
        projectSpace2
      );

      expect(fetched1!.description).toBe("Project 1");
      expect(fetched2!.description).toBe("Project 2");

      expect(fetched1!.id).not.toBe(fetched2!.id);
      expect(fetched1!.sId).not.toBe(fetched2!.sId);
    });
  });
});
