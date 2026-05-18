import * as projectsApi from "@app/lib/api/projects/context";
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
        await vi.importActual<typeof projectsApi>(
          "@app/lib/api/projects/context"
        )
      ).addContentNodeToProject(...args)
    );
  });

  describe("GET", () => {
    it("does not surface file-backed attachments (files now live under /spaces/[spaceId]/files)", async () => {
      const { auth, req, res, user, globalSpace } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "user",
        });

      await ProjectFileFactory.create(auth, user, globalSpace, {
        contentType: "text/plain",
        fileName: "test1.txt",
        fileSize: 100,
        status: "ready",
      });

      req.query.spaceId = globalSpace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.attachments).toHaveLength(0);
    });

    it("filters content-node attachments by query (case-insensitive)", async () => {
      const { req, res, globalSpace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      listProjectContextAttachmentsSpy.mockResolvedValue([
        {
          title: "Budget plan",
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
          nodeId: "node_1",
          nodeDataSourceViewId: "dsv_1",
          nodeType: "document",
          sourceUrl: null,
        } as any,
        {
          title: "Roadmap",
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
          contentFragmentId: "cf_2",
          nodeId: "node_2",
          nodeDataSourceViewId: "dsv_1",
          nodeType: "document",
          sourceUrl: null,
        } as any,
      ]);

      req.query.spaceId = globalSpace.sId;
      req.query.query = "budget";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      const titles = responseData.attachments.map(
        (a: { title: string }) => a.title
      );
      expect(titles).toEqual(["Budget plan"]);
    });

    it("should return empty array when space has no content nodes", async () => {
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
