import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("MembershipResource", () => {
  describe("firstUsedAt behavior", () => {
    let workspace: WorkspaceType;
    let lightWorkspace: LightWorkspaceType;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      lightWorkspace = renderLightWorkspaceType({ workspace });
    });

    describe("createMembership origin-based activation", () => {
      it("should activate immediately for 'invited' origin", async () => {
        const user = await UserFactory.withoutLastLogin();
        const beforeCreate = new Date();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        expect(membership.firstUsedAt).not.toBeNull();
        expect(membership.firstUsedAt?.getTime()).toBeGreaterThanOrEqual(
          beforeCreate.getTime()
        );
      });

      it("should activate immediately for 'auto-joined' origin", async () => {
        const user = await UserFactory.withoutLastLogin();
        const beforeCreate = new Date();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "auto-joined",
        });

        expect(membership.firstUsedAt).not.toBeNull();
        expect(membership.firstUsedAt?.getTime()).toBeGreaterThanOrEqual(
          beforeCreate.getTime()
        );
      });

      it("should NOT activate for 'provisioned' origin", async () => {
        const user = await UserFactory.withoutLastLogin();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        expect(membership.firstUsedAt).toBeNull();
      });

      it("should default to 'invited' origin when not specified", async () => {
        const user = await UserFactory.withoutLastLogin();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
        });

        expect(membership.origin).toBe("invited");
        expect(membership.firstUsedAt).not.toBeNull();
      });
    });

    describe("markMembershipFirstUse", () => {
      it("should activate provisioned membership when accessing workspace", async () => {
        const user = await UserFactory.withoutLastLogin();

        await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        const beforeActivation = new Date();
        const activated =
          await MembershipResource.markMembershipFirstUse({
            user,
            workspace: lightWorkspace,
          });

        expect(activated).toBe(true);

        const membership =
          await MembershipResource.getActiveMembershipOfUserInWorkspace({
            user,
            workspace: lightWorkspace,
          });

        expect(membership?.firstUsedAt).not.toBeNull();
        expect(membership?.firstUsedAt?.getTime()).toBeGreaterThanOrEqual(
          beforeActivation.getTime()
        );
      });

      it("should NOT re-activate already activated membership", async () => {
        const user = await UserFactory.withoutLastLogin();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        const originalActivatedAt = membership.firstUsedAt;
        expect(originalActivatedAt).not.toBeNull();

        const activated =
          await MembershipResource.markMembershipFirstUse({
            user,
            workspace: lightWorkspace,
          });

        expect(activated).toBe(false);

        const updatedMembership =
          await MembershipResource.getActiveMembershipOfUserInWorkspace({
            user,
            workspace: lightWorkspace,
          });

        expect(updatedMembership?.firstUsedAt?.getTime()).toBe(
          originalActivatedAt?.getTime()
        );
      });

      it("should return false if no membership exists", async () => {
        const user = await UserFactory.withoutLastLogin();

        const activated =
          await MembershipResource.markMembershipFirstUse({
            user,
            workspace: lightWorkspace,
          });

        expect(activated).toBe(false);
      });

      it("should not activate revoked memberships", async () => {
        const user = await UserFactory.withoutLastLogin();

        await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        await MembershipResource.revokeMembership({
          user,
          workspace: lightWorkspace,
        });

        const activated =
          await MembershipResource.markMembershipFirstUse({
            user,
            workspace: lightWorkspace,
          });

        expect(activated).toBe(false);
      });
    });

    describe("getMembersCountForWorkspace", () => {
      it("should count only activated members when activeOnly is true", async () => {
        const activatedUser = await UserFactory.withoutLastLogin();
        const provisionedUser = await UserFactory.withoutLastLogin();

        await MembershipResource.createMembership({
          user: activatedUser,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        await MembershipResource.createMembership({
          user: provisionedUser,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        const count = await MembershipResource.getMembersCountForWorkspace({
          workspace: lightWorkspace,
          activeOnly: true,
        });

        expect(count).toBe(1);
      });

      it("should count all members regardless of activation when activeOnly is false", async () => {
        const invitedUser = await UserFactory.withoutLastLogin();
        const provisionedUser = await UserFactory.withoutLastLogin();

        await MembershipResource.createMembership({
          user: invitedUser,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        await MembershipResource.createMembership({
          user: provisionedUser,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        const count = await MembershipResource.getMembersCountForWorkspace({
          workspace: lightWorkspace,
          activeOnly: false,
        });

        expect(count).toBe(2);
      });

      it("should not count revoked memberships even if activated", async () => {
        const user = await UserFactory.withoutLastLogin();

        await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        await MembershipResource.revokeMembership({
          user,
          workspace: lightWorkspace,
        });

        const count = await MembershipResource.getMembersCountForWorkspace({
          workspace: lightWorkspace,
          activeOnly: true,
        });

        expect(count).toBe(0);
      });
    });
  });
});
