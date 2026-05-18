import { beforeEach, describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import { honoApp } from "@front-api/app";

function searchProjects(
  workspace: { sId: string },
  query: Record<string, string> = {}
) {
  const qs = new URLSearchParams(query).toString();
  const suffix = qs ? `?${qs}` : "";
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/search_projects${suffix}`
  );
}

describe("GET /api/w/:wId/spaces/search_projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Parameter Validation", () => {
    it("returns 400 when limit is negative", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        role: "admin",
      });

      const response = await searchProjects(workspace, { limit: "-1" });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("returns 400 when limit > 2000", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        role: "admin",
      });

      const response = await searchProjects(workspace, { limit: "2001" });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });
  });

  describe("Happy Path", () => {
    it("returns empty array when no projects exist", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        role: "admin",
      });

      const response = await searchProjects(workspace);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.spaces).toHaveLength(0);
      expect(data.hasMore).toBe(false);
      expect(data.lastValue).toBeNull();
    });

    it("returns all project spaces when query is empty", async () => {
      const { workspace, user, auth } = await createPrivateApiMockRequest({
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

      await auth.refresh();

      const response = await searchProjects(workspace);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.spaces.length).toBeGreaterThanOrEqual(1);
    });

    it("filters projects by name (case-insensitive)", async () => {
      const { workspace, user, auth } = await createPrivateApiMockRequest({
        role: "admin",
      });

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const project = await SpaceFactory.project(workspace);
      await project.addMembers(adminAuth, { userIds: [user.sId] });

      await auth.refresh();

      const response = await searchProjects(workspace, { query: "project" });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.spaces.length).toBeGreaterThanOrEqual(1);
      expect(
        data.spaces.every((s: { name: string }) =>
          s.name.toLowerCase().includes("project")
        )
      ).toBe(true);
    });

    it("returns spaces sorted alphabetically", async () => {
      const { workspace, user, auth } = await createPrivateApiMockRequest({
        role: "admin",
      });

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      for (let i = 0; i < 10; i++) {
        const project = await SpaceFactory.project(workspace);
        await project.addMembers(adminAuth, { userIds: [user.sId] });
      }

      await auth.refresh();

      const response = await searchProjects(workspace);

      expect(response.status).toBe(200);
      const data = await response.json();
      const names = data.spaces.map((s: { name: string }) => s.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it("respects the limit parameter", async () => {
      const { workspace, user, auth } = await createPrivateApiMockRequest({
        role: "admin",
      });

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      for (let i = 0; i < 5; i++) {
        const project = await SpaceFactory.project(workspace);
        await project.addMembers(adminAuth, { userIds: [user.sId] });
      }

      await auth.refresh();

      const response = await searchProjects(workspace, { limit: "2" });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.spaces.length).toBe(2);
      expect(data.hasMore).toBe(true);
      expect(data.lastValue).not.toBeNull();
    });

    it("paginates correctly using lastValue cursor", async () => {
      const { workspace, user, auth } = await createPrivateApiMockRequest({
        role: "admin",
      });

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      for (let i = 0; i < 3; i++) {
        const project = await SpaceFactory.project(workspace);
        await project.addMembers(adminAuth, { userIds: [user.sId] });
      }

      await auth.refresh();

      const firstResponse = await searchProjects(workspace, { limit: "2" });

      expect(firstResponse.status).toBe(200);
      const firstPage = await firstResponse.json();
      expect(firstPage.spaces.length).toBe(2);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.lastValue).toBe(firstPage.spaces[1].name);

      const secondResponse = await searchProjects(workspace, {
        limit: "2",
        lastValue: firstPage.lastValue,
      });

      expect(secondResponse.status).toBe(200);
      const secondPage = await secondResponse.json();
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
      const { workspace, user, auth } = await createPrivateApiMockRequest({
        role: "user",
      });

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const permittedSpace = await SpaceFactory.project(workspace);
      const unpermittedSpace = await SpaceFactory.project(workspace);

      await permittedSpace.addMembers(adminAuth, { userIds: [user.sId] });

      await auth.refresh();

      const response = await searchProjects(workspace);

      expect(response.status).toBe(200);
      const data = await response.json();

      const returnedSpaceIds = data.spaces.map((s: { sId: string }) => s.sId);
      expect(returnedSpaceIds).toContain(permittedSpace.sId);
      expect(returnedSpaceIds).not.toContain(unpermittedSpace.sId);
    });
  });
});
