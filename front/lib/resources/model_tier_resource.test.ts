import { DEFAULT_MODEL_TIER } from "@app/lib/api/models_picker/tiers";
import { Authenticator } from "@app/lib/auth";
import { ModelTierResource } from "@app/lib/resources/model_tier_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("ModelTierResource", () => {
  let adminAuth: Authenticator;
  let userAuth: Authenticator;
  let adminWorkspace: LightWorkspaceType;

  beforeEach(async () => {
    const adminSetup = await createResourceTest({ role: "admin" });
    adminAuth = adminSetup.authenticator;
    adminWorkspace = adminSetup.workspace;

    const nonAdminUser = await UserFactory.basic();
    await MembershipFactory.associate(adminWorkspace, nonAdminUser, {
      role: "user",
    });
    userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      nonAdminUser.sId,
      adminWorkspace.sId
    );
  });

  describe("workspace tier", () => {
    it("returns null when no workspace default is configured", async () => {
      expect(await ModelTierResource.getWorkspaceTier(adminAuth)).toBeNull();
    });

    it("sets and gets the workspace default tier as admin", async () => {
      const result = await ModelTierResource.setWorkspaceTier(adminAuth, {
        tier: "balanced",
      });
      expect(result.isOk()).toBe(true);

      expect(await ModelTierResource.getWorkspaceTier(adminAuth)).toBe(
        "balanced"
      );
    });

    it("rejects set and clear for non-admins", async () => {
      const setResult = await ModelTierResource.setWorkspaceTier(userAuth, {
        tier: "balanced",
      });
      expect(setResult.isErr()).toBe(true);
      if (setResult.isErr()) {
        expect(setResult.error.message).toMatch(/Only admins/);
      }

      await ModelTierResource.setWorkspaceTier(adminAuth, { tier: "powerful" });

      const clearResult = await ModelTierResource.clearWorkspaceTier(userAuth);
      expect(clearResult.isErr()).toBe(true);
      if (clearResult.isErr()) {
        expect(clearResult.error.message).toMatch(/Only admins/);
      }
      expect(await ModelTierResource.getWorkspaceTier(adminAuth)).toBe(
        "powerful"
      );
    });

    it("clears the workspace default tier as admin", async () => {
      await ModelTierResource.setWorkspaceTier(adminAuth, {
        tier: "powerful",
      });

      const clearResult = await ModelTierResource.clearWorkspaceTier(adminAuth);
      expect(clearResult.isOk()).toBe(true);
      if (clearResult.isOk()) {
        expect(clearResult.value).toBe(true);
      }

      expect(await ModelTierResource.getWorkspaceTier(adminAuth)).toBeNull();
    });

    it("returns false when clearing an already-default workspace tier", async () => {
      const clearResult = await ModelTierResource.clearWorkspaceTier(adminAuth);
      expect(clearResult.isOk()).toBe(true);
      if (clearResult.isOk()) {
        expect(clearResult.value).toBe(false);
      }
    });
  });

  describe("user tier override", () => {
    it("returns null when the user has no override", async () => {
      const user = await UserFactory.basic();

      expect(
        await ModelTierResource.getUserTier(adminAuth, { userId: user.id })
      ).toBeNull();
    });

    it("sets, updates, and clears a user tier override as admin", async () => {
      const user = await UserFactory.basic();

      expect(
        (
          await ModelTierResource.setUserTier(adminAuth, {
            userId: user.id,
            tier: "fast",
          })
        ).isOk()
      ).toBe(true);
      expect(
        await ModelTierResource.getUserTier(adminAuth, { userId: user.id })
      ).toBe("fast");

      expect(
        (
          await ModelTierResource.setUserTier(adminAuth, {
            userId: user.id,
            tier: "frontier",
          })
        ).isOk()
      ).toBe(true);
      expect(
        await ModelTierResource.getUserTier(adminAuth, { userId: user.id })
      ).toBe("frontier");

      const clearResult = await ModelTierResource.clearUserTier(adminAuth, {
        userId: user.id,
      });
      expect(clearResult.isOk()).toBe(true);
      if (clearResult.isOk()) {
        expect(clearResult.value).toBe(true);
      }
      expect(
        await ModelTierResource.getUserTier(adminAuth, { userId: user.id })
      ).toBeNull();
    });

    it("rejects set and clear for non-admins", async () => {
      const user = await UserFactory.basic();

      const setResult = await ModelTierResource.setUserTier(userAuth, {
        userId: user.id,
        tier: "fast",
      });
      expect(setResult.isErr()).toBe(true);

      await ModelTierResource.setUserTier(adminAuth, {
        userId: user.id,
        tier: "fast",
      });

      const clearResult = await ModelTierResource.clearUserTier(userAuth, {
        userId: user.id,
      });
      expect(clearResult.isErr()).toBe(true);
      expect(
        await ModelTierResource.getUserTier(adminAuth, { userId: user.id })
      ).toBe("fast");
    });
  });

  describe("group tier override", () => {
    it("sets and clears a group tier override as admin", async () => {
      const group = await GroupFactory.regular(adminWorkspace, "Engineering");

      expect(
        (
          await ModelTierResource.setGroupTier(adminAuth, {
            groupId: group.id,
            tier: "powerful",
          })
        ).isOk()
      ).toBe(true);
      expect(
        await ModelTierResource.getGroupTier(adminAuth, { groupId: group.id })
      ).toBe("powerful");

      const clearResult = await ModelTierResource.clearGroupTier(adminAuth, {
        groupId: group.id,
      });
      expect(clearResult.isOk()).toBe(true);
      if (clearResult.isOk()) {
        expect(clearResult.value).toBe(true);
      }
      expect(
        await ModelTierResource.getGroupTier(adminAuth, { groupId: group.id })
      ).toBeNull();
    });

    it("rejects set and clear for non-admins", async () => {
      const group = await GroupFactory.regular(adminWorkspace, "Design");

      const setResult = await ModelTierResource.setGroupTier(userAuth, {
        groupId: group.id,
        tier: "powerful",
      });
      expect(setResult.isErr()).toBe(true);

      await ModelTierResource.setGroupTier(adminAuth, {
        groupId: group.id,
        tier: "powerful",
      });

      const clearResult = await ModelTierResource.clearGroupTier(userAuth, {
        groupId: group.id,
      });
      expect(clearResult.isErr()).toBe(true);
      expect(
        await ModelTierResource.getGroupTier(adminAuth, { groupId: group.id })
      ).toBe("powerful");
    });
  });

  it("does not conflate workspace default with user overrides", async () => {
    const user = await UserFactory.basic();

    await ModelTierResource.setWorkspaceTier(adminAuth, {
      tier: DEFAULT_MODEL_TIER,
    });
    await ModelTierResource.setUserTier(adminAuth, {
      userId: user.id,
      tier: "fast",
    });

    expect(await ModelTierResource.getWorkspaceTier(adminAuth)).toBe(
      DEFAULT_MODEL_TIER
    );
    expect(
      await ModelTierResource.getUserTier(adminAuth, { userId: user.id })
    ).toBe("fast");
  });
});
