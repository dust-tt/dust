import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./search_projects";

describe("GET /api/w/[wId]/spaces/search_projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Parameter Validation", () => {
    it("returns 405 for non-GET methods", async () => {
      for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
        const { req, res, workspace } = await createPrivateApiMockRequest({
          method,
          role: "admin",
        });

        req.query.wId = workspace.sId;

        await handler(req, res);

        expect(res._getStatusCode()).toBe(405);
        expect(res._getJSONData().error.type).toBe(
          "method_not_supported_error"
        );
      }
    });

    it("returns 400 when limit is negative", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.limit = "-1";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 400 when limit > 2000", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.limit = "2001";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });
  });

  describe("Happy Path", () => {
    it("returns empty array when no projects exist", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.spaces).toHaveLength(0);
      expect(data.hasMore).toBe(false);
      expect(data.lastValue).toBeNull();
    });

    it("returns all project spaces when query is empty", async () => {
      const { req, res, workspace, user, authenticator } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const project = await SpaceFactory.project(workspace);

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const addRes = await project.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      if (!addRes.isOk()) {
        throw new Error("Failed to add user to project");
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.spaces.length).toBeGreaterThanOrEqual(1);
    });

    it("filters projects by name (case-insensitive)", async () => {
      const { req, res, workspace, user, authenticator } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const project = await SpaceFactory.project(workspace);
      await project.addMembers(adminAuth, { userIds: [user.sId] });

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      // Search for "project" which is part of the auto-generated name
      req.query.query = "project";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.spaces.length).toBeGreaterThanOrEqual(1);
      expect(
        data.spaces.every((s: { name: string }) =>
          s.name.toLowerCase().includes("project")
        )
      ).toBe(true);
    });

    it("returns spaces sorted alphabetically", async () => {
      const { req, res, workspace, user, authenticator } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      for (let i = 0; i < 3; i++) {
        const project = await SpaceFactory.project(workspace);
        await project.addMembers(adminAuth, { userIds: [user.sId] });
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      const names = data.spaces.map((s: { name: string }) => s.name);
      expect(names).toEqual([...names].sort());
    });

    it("respects the limit parameter", async () => {
      const { req, res, workspace, user, authenticator } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      for (let i = 0; i < 5; i++) {
        const project = await SpaceFactory.project(workspace);
        await project.addMembers(adminAuth, { userIds: [user.sId] });
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.limit = "2";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.spaces.length).toBe(2);
      expect(data.hasMore).toBe(true);
      expect(data.lastValue).not.toBeNull();
    });

    it("paginates correctly using lastValue cursor", async () => {
      const { req, res, workspace, user, authenticator } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      for (let i = 0; i < 3; i++) {
        const project = await SpaceFactory.project(workspace);
        await project.addMembers(adminAuth, { userIds: [user.sId] });
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.limit = "2";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const firstPage = res._getJSONData();
      expect(firstPage.spaces.length).toBe(2);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.lastValue).toBe(firstPage.spaces[1].name);

      // Create a new request/response but reuse the same session mock
      const { req: req2, res: res2 } = createMocks<
        NextApiRequest,
        NextApiResponse
      >({
        method: "GET",
        query: {
          wId: workspace.sId,
          limit: "2",
          lastValue: firstPage.lastValue,
        },
        headers: {},
      });

      await handler(req2, res2);

      expect(res2._getStatusCode()).toBe(200);
      const secondPage = res2._getJSONData();
      expect(secondPage.spaces.length).toBeGreaterThanOrEqual(1);
      const firstPageNames = firstPage.spaces.map(
        (s: { name: string }) => s.name
      );
      const secondPageNames = secondPage.spaces.map(
        (s: { name: string }) => s.name
      );
      expect(
        firstPageNames.some((n: string) => secondPageNames.includes(n))
      ).toBe(false);
    });

    it("excludes project spaces user cannot read", async () => {
      const { req, res, workspace, user, authenticator } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "user",
        });

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const permittedSpace = await SpaceFactory.project(workspace);
      const unpermittedSpace = await SpaceFactory.project(workspace);

      await permittedSpace.addMembers(adminAuth, { userIds: [user.sId] });

      await authenticator.refresh();

      req.query.wId = workspace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();

      const returnedSpaceIds = data.spaces.map((s: { sId: string }) => s.sId);
      expect(returnedSpaceIds).toContain(permittedSpace.sId);
      expect(returnedSpaceIds).not.toContain(unpermittedSpace.sId);
    });
  });
});
