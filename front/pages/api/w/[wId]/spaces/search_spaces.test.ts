import { beforeEach, describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./search_spaces";

describe("GET /api/w/[wId]/spaces/search_spaces", () => {
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

    it("returns 400 when limit < 1", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.limit = "0";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 400 when limit > 100", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.limit = "101";

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
        data.spaces.every((s: { space: { name: string } }) =>
          s.space.name.toLowerCase().includes("project")
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
      const names = data.spaces.map(
        (s: { space: { name: string } }) => s.space.name
      );
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
  });
});
