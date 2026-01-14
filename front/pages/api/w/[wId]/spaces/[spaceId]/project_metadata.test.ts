import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import handler from "./project_metadata";

describe("GET /api/w/[wId]/spaces/[spaceId]/project_metadata", () => {
  describe("with project space", () => {
    it("returns null projectMetadata when no metadata exists", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        role: "admin",
      });

      // Create a project space
      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        projectMetadata: null,
      });
    });

    it("returns projectMetadata when it exists", async () => {
      const { req, res, workspace, authenticator } =
        await createPrivateApiMockRequest({
          role: "admin",
        });

      // Create a project space
      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;

      // Create metadata
      await ProjectMetadataResource.makeNew(authenticator, projectSpace, {
        description: "Test project description",
        urls: ["https://github.com/test"],
        tags: ["frontend", "react"],
        emoji: "rocket",
        color: "#FF0000",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projectMetadata).not.toBeNull();
      expect(data.projectMetadata.description).toBe("Test project description");
      expect(data.projectMetadata.urls).toEqual(["https://github.com/test"]);
      expect(data.projectMetadata.tags).toEqual(["frontend", "react"]);
      expect(data.projectMetadata.emoji).toBe("rocket");
      expect(data.projectMetadata.color).toBe("#FF0000");
      expect(data.projectMetadata.spaceId).toBe(projectSpace.sId);
      expect(data.projectMetadata.sId).toMatch(/^pmd_/);
    });

    it("allows non-admin users to read metadata if they have access to the space", async () => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        role: "user",
      });

      // Create a project space
      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;

      // Add user to the project space's group so they have access
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const [spaceGroup] = projectSpace.groups.filter((g) => !g.isGlobal());
      await spaceGroup.addMembers(adminAuth, [user.toJSON()]);

      // Create metadata using internal admin
      await ProjectMetadataResource.makeNew(adminAuth, projectSpace, {
        description: "User readable",
        urls: [],
        tags: [],
        emoji: null,
        color: null,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projectMetadata.description).toBe("User readable");
    });
  });

  describe("with non-project space", () => {
    it("returns 400 error for regular space", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        role: "admin",
      });

      // Create a regular space
      const regularSpace = await SpaceFactory.regular(workspace);
      req.query.spaceId = regularSpace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
      expect(res._getJSONData().error.message).toContain(
        "only available for project spaces"
      );
    });

    it("returns 400 error for global space", async () => {
      const { req, res, globalSpace } = await createPrivateApiMockRequest({
        role: "admin",
      });

      req.query.spaceId = globalSpace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 400 error for system space", async () => {
      const { req, res, systemSpace } = await createPrivateApiMockRequest({
        role: "admin",
      });

      req.query.spaceId = systemSpace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });
  });
});

describe("PATCH /api/w/[wId]/spaces/[spaceId]/project_metadata", () => {
  describe("authorization", () => {
    it("allows admin to update metadata", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;
      req.body = {
        description: "Admin updated",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projectMetadata.description).toBe("Admin updated");
    });

    it("denies non-admin users from updating metadata even if they have read access", async () => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "user",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;

      // Add user to the project space's group so they have read access
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const [spaceGroup] = projectSpace.groups.filter((g) => !g.isGlobal());
      await spaceGroup.addMembers(adminAuth, [user.toJSON()]);

      req.body = {
        description: "User attempt",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error.type).toBe("workspace_auth_error");
      expect(res._getJSONData().error.message).toContain("Only admins");
    });
  });

  describe("creating new metadata", () => {
    it("creates metadata with all fields", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;
      req.body = {
        description: "New project description",
        urls: ["https://github.com/repo", "https://docs.example.com"],
        tags: ["backend", "api", "typescript"],
        emoji: "sparkles",
        color: "#00FF00",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projectMetadata.description).toBe("New project description");
      expect(data.projectMetadata.urls).toEqual([
        "https://github.com/repo",
        "https://docs.example.com",
      ]);
      expect(data.projectMetadata.tags).toEqual([
        "backend",
        "api",
        "typescript",
      ]);
      expect(data.projectMetadata.emoji).toBe("sparkles");
      expect(data.projectMetadata.color).toBe("#00FF00");
    });

    it("creates metadata with partial fields", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;
      req.body = {
        description: "Just a description",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projectMetadata.description).toBe("Just a description");
      expect(data.projectMetadata.urls).toEqual([]);
      expect(data.projectMetadata.tags).toEqual([]);
      expect(data.projectMetadata.emoji).toBeNull();
      expect(data.projectMetadata.color).toBeNull();
    });

    it("creates metadata with empty body", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;
      req.body = {};

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projectMetadata.description).toBeNull();
      expect(data.projectMetadata.urls).toEqual([]);
      expect(data.projectMetadata.tags).toEqual([]);
    });
  });

  describe("updating existing metadata", () => {
    it("updates description only", async () => {
      const { req, res, workspace, authenticator } =
        await createPrivateApiMockRequest({
          method: "PATCH",
          role: "admin",
        });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;

      // Create initial metadata
      await ProjectMetadataResource.makeNew(authenticator, projectSpace, {
        description: "Initial",
        urls: ["https://original.com"],
        tags: ["original"],
        emoji: "star",
        color: "#000000",
      });

      req.body = {
        description: "Updated description",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projectMetadata.description).toBe("Updated description");
      // Other fields are updated but preserve previous values through the resource
    });

    it("updates urls and tags", async () => {
      const { req, res, workspace, authenticator } =
        await createPrivateApiMockRequest({
          method: "PATCH",
          role: "admin",
        });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;

      // Create initial metadata
      await ProjectMetadataResource.makeNew(authenticator, projectSpace, {
        description: "Initial",
        urls: ["https://old.com"],
        tags: ["old"],
        emoji: null,
        color: null,
      });

      req.body = {
        urls: ["https://new1.com", "https://new2.com"],
        tags: ["new", "updated"],
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projectMetadata.urls).toEqual([
        "https://new1.com",
        "https://new2.com",
      ]);
      expect(data.projectMetadata.tags).toEqual(["new", "updated"]);
    });

    it("sets values to null", async () => {
      const { req, res, workspace, authenticator } =
        await createPrivateApiMockRequest({
          method: "PATCH",
          role: "admin",
        });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;

      // Create initial metadata with values
      await ProjectMetadataResource.makeNew(authenticator, projectSpace, {
        description: "Will be nulled",
        urls: [],
        tags: [],
        emoji: "star",
        color: "#FF0000",
      });

      req.body = {
        description: null,
        emoji: null,
        color: null,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projectMetadata.description).toBeNull();
      expect(data.projectMetadata.emoji).toBeNull();
      expect(data.projectMetadata.color).toBeNull();
    });

    it("clears arrays by setting to empty", async () => {
      const { req, res, workspace, authenticator } =
        await createPrivateApiMockRequest({
          method: "PATCH",
          role: "admin",
        });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;

      // Create initial metadata with arrays
      await ProjectMetadataResource.makeNew(authenticator, projectSpace, {
        description: null,
        urls: ["https://tobecleared.com"],
        tags: ["tobecleared"],
        emoji: null,
        color: null,
      });

      req.body = {
        urls: [],
        tags: [],
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projectMetadata.urls).toEqual([]);
      expect(data.projectMetadata.tags).toEqual([]);
    });
  });

  describe("validation", () => {
    it("rejects invalid urls type", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;
      req.body = {
        urls: "not-an-array",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("rejects invalid tags type", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;
      req.body = {
        tags: { not: "an-array" },
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("rejects invalid description type", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;
      req.body = {
        description: 12345,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("rejects invalid emoji type", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;
      req.body = {
        emoji: ["not", "a", "string"],
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("rejects invalid color type", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;
      req.body = {
        color: 0xff0000,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("accepts valid unicode emoji", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;
      req.body = {
        emoji: "🚀",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().projectMetadata.emoji).toBe("🚀");
    });
  });

  describe("with non-project space", () => {
    it("returns 400 error for regular space", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const regularSpace = await SpaceFactory.regular(workspace);
      req.query.spaceId = regularSpace.sId;
      req.body = {
        description: "Should fail",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });
  });
});

describe("unsupported methods", () => {
  it("returns 405 for DELETE method", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().error.type).toBe("method_not_supported_error");
  });

  it("returns 405 for POST method", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().error.type).toBe("method_not_supported_error");
  });

  it("returns 405 for PUT method", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().error.type).toBe("method_not_supported_error");
  });
});

describe("edge cases", () => {
  it("handles very long description", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;

    const longDescription = "a".repeat(10000);
    req.body = {
      description: longDescription,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().projectMetadata.description).toBe(
      longDescription
    );
  });

  it("handles many URLs", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;

    const manyUrls = Array.from(
      { length: 100 },
      (_, i) => `https://url${i}.com`
    );
    req.body = {
      urls: manyUrls,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().projectMetadata.urls).toHaveLength(100);
  });

  it("handles special characters in description", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;

    const specialDescription = 'Test <>&"\'`\\n\\t日本語🚀';
    req.body = {
      description: specialDescription,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().projectMetadata.description).toBe(
      specialDescription
    );
  });

  it("handles URLs with query parameters and fragments", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;

    const complexUrls = [
      "https://example.com/path?query=value&other=123",
      "https://example.com/path#fragment",
      "https://example.com/path?a=1&b=2#section",
    ];
    req.body = {
      urls: complexUrls,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().projectMetadata.urls).toEqual(complexUrls);
  });
});
