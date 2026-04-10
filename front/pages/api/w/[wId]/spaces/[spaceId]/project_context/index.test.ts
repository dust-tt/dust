import { isFileAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import * as projectsApi from "@app/lib/api/projects";
import { Authenticator } from "@app/lib/auth";
import type { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ProjectFileFactory } from "@app/tests/utils/ProjectFileFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./index";

const addContentNodeToProjectSpy = vi.spyOn(
  projectsApi,
  "addContentNodeToProject"
);
let listProjectContextAttachmentsSpy = vi.spyOn(
  projectsApi,
  "listProjectContextAttachments"
);

describe("/api/w/[wId]/spaces/[spaceId]/project_context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addContentNodeToProjectSpy.mockClear();
    listProjectContextAttachmentsSpy.mockRestore();
    listProjectContextAttachmentsSpy = vi.spyOn(
      projectsApi,
      "listProjectContextAttachments"
    );
    addContentNodeToProjectSpy.mockImplementation(async (...args) =>
      (
        await vi.importActual<typeof projectsApi>("@app/lib/api/projects")
      ).addContentNodeToProject(...args)
    );
  });

  describe("GET", () => {
    it("should return project files for a valid space", async () => {
      const {
        auth: auth,
        req,
        res,
        user,
        globalSpace,
      } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const space = globalSpace;

      await ProjectFileFactory.create(auth, user, space, {
        contentType: "text/plain",
        fileName: "test1.txt",
        fileSize: 100,
        status: "ready",
      });

      await ProjectFileFactory.create(auth, user, space, {
        contentType: "image/png",
        fileName: "test2.png",
        fileSize: 200,
        status: "ready",
      });

      req.query.spaceId = space.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.attachments).toHaveLength(2);
      const titles = responseData.attachments.map(
        (a: { title: string }) => a.title
      );
      expect(new Set(titles)).toEqual(new Set(["test1.txt", "test2.png"]));
      const withCreator = responseData.attachments.find(
        (a: { title: string }) => a.title === "test1.txt"
      );
      expect(withCreator).toBeDefined();
      expect(isFileAttachmentType(withCreator)).toBe(true);
      if (isFileAttachmentType(withCreator)) {
        expect(withCreator.creator?.type).toBe("user");
        expect(withCreator.creator?.name).toBeDefined();
      }
    });

    it("filters attachments by query (case-insensitive)", async () => {
      const { auth, req, res, user, globalSpace } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "user",
        });

      const space = globalSpace;

      await ProjectFileFactory.create(auth, user, space, {
        contentType: "text/plain",
        fileName: "Budget 2026.txt",
        fileSize: 100,
        status: "ready",
      });

      await ProjectFileFactory.create(auth, user, space, {
        contentType: "text/plain",
        fileName: "Roadmap.txt",
        fileSize: 100,
        status: "ready",
      });

      req.query.spaceId = space.sId;
      req.query.query = "budget";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      const titles = responseData.attachments.map(
        (a: { title: string }) => a.title
      );
      expect(titles).toEqual(["Budget 2026.txt"]);
    });

    it("filters attachments by type=content-node", async () => {
      const { req, res, globalSpace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      // Mock the list function so we can focus on filtering behavior.
      listProjectContextAttachmentsSpy.mockResolvedValue([
        {
          title: "notes.txt",
          contentType: "text/plain",
          contentFragmentVersion: "latest",
          snippet: null,
          generatedTables: [],
          isIncludable: true,
          isSearchable: false,
          isQueryable: false,
          isInProjectContext: true,
          creator: null,
          hidden: false,
          fileId: "file_1",
          source: "user",
          createdAt: Date.now(),
        } as any,
        {
          title: "Spec doc",
          contentType: "text/plain",
          contentFragmentVersion: "latest",
          snippet: null,
          generatedTables: [],
          isIncludable: true,
          isSearchable: false,
          isQueryable: false,
          isInProjectContext: true,
          creator: null,
          hidden: false,
          contentFragmentId: "cf_1",
          nodeId: "core-node",
          nodeDataSourceViewId: "dsv_1",
          nodeType: "document",
          sourceUrl: null,
        } as any,
      ]);

      req.query.spaceId = globalSpace.sId;
      req.query.type = "content-node";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.attachments).toHaveLength(1);
      expect(responseData.attachments[0].title).toBe("Spec doc");
    });

    it("should return empty array when space has no files", async () => {
      const { req, res, globalSpace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      req.query.spaceId = globalSpace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.attachments).toHaveLength(0);
    });

    it("should return 404 for non-existent space", async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      req.query.spaceId = "non_existent_space_id";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const responseData = res._getJSONData();
      expect(responseData.error.type).toBe("space_not_found");
    });

    it("should return 404 when user cannot read space", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const space = await SpaceFactory.regular(workspace);

      const otherUser = await UserFactory.basic();
      await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      req.query.spaceId = space.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const responseData = res._getJSONData();
      expect(responseData.error.type).toBe("space_not_found");
    });

    it("should infer attachment creator from the authenticated user when syncing fragments", async () => {
      const {
        req,
        res,
        auth: auth,
        user,
        globalSpace,
      } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const space = globalSpace;

      await ProjectFileFactory.create(auth, user, space, {
        contentType: "text/csv",
        fileName: "data.csv",
        fileSize: 500,
        status: "ready",
      });

      await ProjectFileFactory.create(auth, null, space, {
        contentType: "application/json",
        fileName: "data.json",
        fileSize: 300,
        status: "ready",
      });

      req.query.spaceId = space.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.attachments).toHaveLength(2);

      const fileWithUserResponse = responseData.attachments.find(
        (f: { title: string }) => f.title === "data.csv"
      );
      const fileWithoutUserResponse = responseData.attachments.find(
        (f: { title: string }) => f.title === "data.json"
      );

      expect(fileWithUserResponse.creator).toBeDefined();
      expect(fileWithUserResponse.creator.type).toBe("user");
      expect(fileWithUserResponse.creator.name).toBeDefined();

      // File row may have no uploader (`user: null` in factory); creator still comes from auth at upsert.
      expect(fileWithoutUserResponse.creator).toBeDefined();
      expect(fileWithoutUserResponse.creator.type).toBe("user");
      expect(fileWithoutUserResponse.creator.name).toBe(
        fileWithUserResponse.creator.name
      );
    });

    it("should return 400 for invalid spaceId parameter", async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      req.query.spaceId = ["invalid", "array"];

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = res._getJSONData();
      expect(responseData.error.type).toBe("invalid_request_error");
    });

    it("should return files with correct metadata format", async () => {
      const {
        auth: auth,
        req,
        res,
        user,
        globalSpace,
      } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const space = globalSpace;

      await ProjectFileFactory.create(auth, user, space, {
        contentType: "text/markdown",
        fileName: "readme.md",
        fileSize: 1024,
        status: "ready",
      });

      req.query.spaceId = space.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.attachments).toHaveLength(1);

      const attachment = responseData.attachments[0];
      expect(isFileAttachmentType(attachment)).toBe(true);
      if (isFileAttachmentType(attachment)) {
        expect(attachment.fileId).toBeDefined();
        expect(attachment.title).toBe("readme.md");
        expect(attachment.contentType).toBe("text/markdown");
        expect(attachment.source).toBe("user");
        expect(attachment.isInProjectContext).toBe(true);
        expect(attachment.contentFragmentVersion).toBe("latest");
        expect(typeof attachment.createdAt).toBe("number");
      }
    });
  });

  describe("POST (content node)", () => {
    it("returns 400 when space is not a project", async () => {
      const { req, res, globalSpace, auth } = await createPrivateApiMockRequest(
        {
          method: "POST",
          role: "user",
        }
      );

      await FeatureFlagFactory.basic(auth, "projects");

      req.query.spaceId = globalSpace.sId;
      req.body = {
        title: "Ref",
        nodeId: "n1",
        nodeDataSourceViewId: "dsv1",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.message).toContain("project");
      expect(addContentNodeToProjectSpy).not.toHaveBeenCalled();
    });

    it("returns 403 without write access to project", async () => {
      const canWriteSpy = vi
        .spyOn(SpaceResource.prototype, "canWrite")
        .mockReturnValue(false);

      try {
        const { req, res, workspace, user, auth } =
          await createPrivateApiMockRequest({
            method: "POST",
            role: "user",
          });

        await FeatureFlagFactory.basic(auth, "projects");

        const project = await SpaceFactory.project(workspace, user.id);
        req.query.spaceId = project.sId;
        req.body = {
          title: "Ref",
          nodeId: "n1",
          nodeDataSourceViewId: "dsv1",
        };

        await handler(req, res);

        expect(res._getStatusCode()).toBe(403);
        expect(res._getJSONData().error.type).toBe("workspace_auth_error");
        expect(addContentNodeToProjectSpy).not.toHaveBeenCalled();
      } finally {
        canWriteSpy.mockRestore();
      }
    });

    it("returns 201 and content fragment payload when add succeeds", async () => {
      const { req, res, workspace, user, auth } =
        await createPrivateApiMockRequest({
          method: "POST",
          role: "user",
        });

      await FeatureFlagFactory.basic(auth, "projects");

      const project = await SpaceFactory.project(workspace, user.id);

      const mockFragment = {
        sId: "cf_mock",
        title: "Synced title",
        contentType: "text/plain",
        nodeId: "core-node",
        nodeDataSourceViewId: 999,
        nodeType: "document",
      } as ContentFragmentResource;

      addContentNodeToProjectSpy.mockResolvedValue(new Ok(mockFragment));

      req.query.spaceId = project.sId;
      req.body = {
        title: "My doc",
        nodeId: "core-node",
        nodeDataSourceViewId: "dsview-sid",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const data = res._getJSONData();
      expect(data.contentFragment.sId).toBe("cf_mock");
      expect(data.contentFragment.title).toBe("Synced title");
      expect(data.contentFragment.nodeId).toBe("core-node");
      expect(data.contentFragment.nodeType).toBe("document");
      expect(data.contentFragment.nodeDataSourceViewId).toBeDefined();
      expect(addContentNodeToProjectSpy).toHaveBeenCalledWith(
        expect.anything(),
        {
          space: expect.objectContaining({ sId: project.sId }),
          contentFragment: {
            title: "My doc",
            nodeId: "core-node",
            nodeDataSourceViewId: "dsview-sid",
          },
        }
      );
    });

    it("returns 400 for invalid JSON body", async () => {
      const { req, res, workspace, user, auth } =
        await createPrivateApiMockRequest({
          method: "POST",
          role: "user",
        });

      await FeatureFlagFactory.basic(auth, "projects");

      const project = await SpaceFactory.project(workspace, user.id);
      req.query.spaceId = project.sId;
      req.body = { title: "" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 405 for PATCH", async () => {
      const { req, res, globalSpace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "user",
      });

      req.query.spaceId = globalSpace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData().error.type).toBe("method_not_supported_error");
    });
  });
});
