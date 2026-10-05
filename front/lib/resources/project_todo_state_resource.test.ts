import { Authenticator } from "@app/lib/auth";
import { ProjectTaskStateResource } from "@app/lib/resources/project_task_state_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

describe("ProjectTaskStateResource", () => {
  describe("fetchBySpace", () => {
    it("returns null when no state exists for the user", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });
      const space = await SpaceFactory.project(workspace);

      const result = await ProjectTaskStateResource.fetchBySpace(
        authenticator,
        { spaceId: space.id }
      );

      expect(result).toBeNull();
    });

    it("does not return state belonging to a different user", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });
      const space = await SpaceFactory.project(workspace);

      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, {
        role: "user",
      });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      await ProjectTaskStateResource.upsertBySpace(otherAuth, {
        spaceId: space.id,
        lastReadAt: new Date(),
      });

      const result = await ProjectTaskStateResource.fetchBySpace(
        authenticator,
        { spaceId: space.id }
      );

      expect(result).toBeNull();
    });
  });

  describe("fetchAllBySpace", () => {
    it("returns states for all users in the space", async () => {
      const { workspace, authenticator, user } = await createResourceTest({
        role: "user",
      });
      const space = await SpaceFactory.project(workspace);

      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, {
        role: "user",
      });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      await ProjectTaskStateResource.upsertBySpace(authenticator, {
        spaceId: space.id,
        lastReadAt: new Date("2025-01-01T00:00:00Z"),
      });
      await ProjectTaskStateResource.upsertBySpace(otherAuth, {
        spaceId: space.id,
        lastReadAt: new Date("2025-01-02T00:00:00Z"),
      });

      const results = await ProjectTaskStateResource.fetchAllBySpace(
        authenticator,
        { spaceId: space.id }
      );

      expect(results).toHaveLength(2);
      const userIds = results.map((r) => r.userId);
      expect(userIds).toContain(user.id);
      expect(userIds).toContain(otherUser.id);
    });

    it("does not return states from a different space", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });
      const space1 = await SpaceFactory.project(workspace);
      const space2 = await SpaceFactory.project(workspace);

      await ProjectTaskStateResource.upsertBySpace(authenticator, {
        spaceId: space1.id,
        lastReadAt: new Date(),
      });

      const results = await ProjectTaskStateResource.fetchAllBySpace(
        authenticator,
        { spaceId: space2.id }
      );

      expect(results).toHaveLength(0);
    });
  });

  describe("upsertBySpace", () => {
    it("creates a new state on first call", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });
      const space = await SpaceFactory.project(workspace);
      const lastReadAt = new Date("2025-06-01T00:00:00Z");

      const state = await ProjectTaskStateResource.upsertBySpace(
        authenticator,
        { spaceId: space.id, lastReadAt }
      );

      expect(state.lastReadAt).toEqual(lastReadAt);
      expect(state.lastCleanedAt).toBeNull();
    });

    it("updates lastReadAt on subsequent calls", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });
      const space = await SpaceFactory.project(workspace);

      await ProjectTaskStateResource.upsertBySpace(authenticator, {
        spaceId: space.id,
        lastReadAt: new Date("2025-01-01T00:00:00Z"),
      });

      const updatedAt = new Date("2025-06-01T00:00:00Z");
      await ProjectTaskStateResource.upsertBySpace(authenticator, {
        spaceId: space.id,
        lastReadAt: updatedAt,
      });

      const result = await ProjectTaskStateResource.fetchBySpace(
        authenticator,
        { spaceId: space.id }
      );

      expect(result!.lastReadAt).toEqual(updatedAt);
    });
  });
});
