import { Authenticator } from "@app/lib/auth";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

function accessCheck(
  workspace: { sId: string },
  { spaceIds = [], userIds = [] }: { spaceIds?: string[]; userIds?: string[] }
) {
  const params = new URLSearchParams();
  for (const spaceId of spaceIds) {
    params.append("spaceIds", spaceId);
  }
  for (const userId of userIds) {
    params.append("userIds", userId);
  }

  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/access-check?${params.toString()}`
  );
}

describe("GET /api/w/:wId/spaces/access-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Parameter Validation", () => {
    it("returns 400 when spaceIds is missing", async () => {
      const { workspace, user } = await createPrivateApiMockRequest();

      const response = await accessCheck(workspace, { userIds: [user.sId] });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("returns 400 when userIds is missing", async () => {
      const { workspace } = await createPrivateApiMockRequest();
      const space = await SpaceFactory.regular(workspace);

      const response = await accessCheck(workspace, { spaceIds: [space.sId] });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("returns 400 when more than 100 space ids are provided", async () => {
      const { workspace, user } = await createPrivateApiMockRequest();

      const response = await accessCheck(workspace, {
        spaceIds: Array.from({ length: 101 }, (_, i) => `spc_${i}`),
        userIds: [user.sId],
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toContain("Too many ids");
    });
  });

  describe("Authorization", () => {
    it("returns 404 when a requested space does not exist", async () => {
      const { workspace, user } = await createPrivateApiMockRequest();

      const response = await accessCheck(workspace, {
        spaceIds: ["spc_doesnotexist"],
        userIds: [user.sId],
      });

      expect(response.status).toBe(404);
      expect((await response.json()).error.type).toBe("space_not_found");
    });

    it("returns 403 when the caller cannot read a requested space", async () => {
      const { workspace, user } = await createPrivateApiMockRequest();

      // The caller is not a member of this restricted space.
      const space = await SpaceFactory.regular(workspace);

      const response = await accessCheck(workspace, {
        spaceIds: [space.sId],
        userIds: [user.sId],
      });

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    });
  });

  describe("Happy Path", () => {
    it("reports only the users that are not members of the space", async () => {
      const { workspace, user } = await createPrivateApiMockRequest();

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const space = await SpaceFactory.regular(workspace);
      const addRes = await space.addMembers(adminAuth, { userIds: [user.sId] });
      if (addRes.isErr()) {
        throw new Error("Failed to add the caller to the space");
      }

      const outsider = await UserFactory.basic();
      await MembershipFactory.associate(workspace, outsider, { role: "user" });

      const response = await accessCheck(workspace, {
        spaceIds: [space.sId],
        userIds: [user.sId, outsider.sId],
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.spacesAccess).toHaveLength(1);
      expect(data.spacesAccess[0].spaceId).toBe(space.sId);
      expect(data.spacesAccess[0].userIdsWithoutAccess).toEqual([outsider.sId]);
    });

    it("reports every space when several are requested", async () => {
      const { workspace, user } = await createPrivateApiMockRequest();

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const spaceWithBoth = await SpaceFactory.regular(workspace);
      const spaceWithCallerOnly = await SpaceFactory.regular(workspace);

      const peer = await UserFactory.basic();
      await MembershipFactory.associate(workspace, peer, { role: "user" });

      await spaceWithBoth.addMembers(adminAuth, {
        userIds: [user.sId, peer.sId],
      });
      await spaceWithCallerOnly.addMembers(adminAuth, { userIds: [user.sId] });

      const response = await accessCheck(workspace, {
        spaceIds: [spaceWithBoth.sId, spaceWithCallerOnly.sId],
        userIds: [user.sId, peer.sId],
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      const bySpaceId = new Map<string, string[]>(
        data.spacesAccess.map(
          (entry: { spaceId: string; userIdsWithoutAccess: string[] }) => [
            entry.spaceId,
            entry.userIdsWithoutAccess,
          ]
        )
      );
      expect(bySpaceId.get(spaceWithBoth.sId)).toEqual([]);
      expect(bySpaceId.get(spaceWithCallerOnly.sId)).toEqual([peer.sId]);
    });

    it("reports users that are not members of the workspace", async () => {
      const { workspace, user } = await createPrivateApiMockRequest();

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const space = await SpaceFactory.regular(workspace);
      await space.addMembers(adminAuth, { userIds: [user.sId] });

      // A user of another workspace, and an id that matches nobody.
      const stranger = await UserFactory.basic();

      const response = await accessCheck(workspace, {
        spaceIds: [space.sId],
        userIds: [user.sId, stranger.sId, "usr_doesnotexist"],
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(new Set(data.spacesAccess[0].userIdsWithoutAccess)).toEqual(
        new Set([stranger.sId, "usr_doesnotexist"])
      );
    });
  });
});
