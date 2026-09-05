import { Authenticator } from "@app/lib/auth";
import {
  clearGroupMaxAllowedTier,
  clearUserMaxAllowedTier,
  listGroupAllowedTierNames,
  listUserAllowedTierNames,
  listWorkspaceAllowedTierNames,
  listWorkspaceMaxAllowedTierName,
  resolveAllowedTierNames,
  setGroupMaxAllowedTier,
  setUserMaxAllowedTier,
  setWorkspaceMaxAllowedTierName,
} from "@app/lib/model_tiers/allowed_tiers";
import { expandTiersUpTo } from "@app/lib/model_tiers/tier_order";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { MODELS_TIER_NAMES } from "@app/types/assistant/models/model_tiers";
import { beforeEach, describe, expect, it } from "vitest";

describe("allowed model tiers permissions", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let group: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    group = await GroupFactory.regularManual(workspace, "tier-users");
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  it("defaults workspace allowed tiers to all tiers", async () => {
    expect(await listWorkspaceMaxAllowedTierName(auth)).toBe("premium");
    expect(await listWorkspaceAllowedTierNames(auth)).toEqual([
      ...MODELS_TIER_NAMES,
    ]);
  });

  it("grants and revokes a tier ceiling for a user via a regular_auto group", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const grantResult = await setUserMaxAllowedTier(auth, {
      userId: user.sId,
      tierName: "balanced",
    });
    expect(grantResult.isOk()).toBe(true);

    const users = await listUserAllowedTierNames(auth);
    expect(users).toEqual([
      {
        userId: user.sId,
        maxTierName: "balanced",
      },
    ]);

    const clearResult = await clearUserMaxAllowedTier(auth, {
      userId: user.sId,
    });
    expect(clearResult.isOk()).toBe(true);
    expect(await listUserAllowedTierNames(auth)).toEqual([]);
  });

  it("grants and revokes a tier ceiling for a regular group", async () => {
    await setGroupMaxAllowedTier(auth, {
      groupId: group.sId,
      tierName: "premium",
    });

    expect(await listGroupAllowedTierNames(auth)).toEqual([
      {
        groupId: group.sId,
        maxTierName: "premium",
      },
    ]);

    await clearGroupMaxAllowedTier(auth, {
      groupId: group.sId,
    });
    expect(await listGroupAllowedTierNames(auth)).toEqual([]);
  });

  it("keeps user and group tier overrides on the same tier independent", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const userResult = await setUserMaxAllowedTier(auth, {
      userId: user.sId,
      tierName: "balanced",
    });
    expect(userResult.isOk()).toBe(true);

    // A group override on the same tier lands on the same grant tuple as the user's backing
    // group, through a second group — both must coexist.
    const groupResult = await setGroupMaxAllowedTier(auth, {
      groupId: group.sId,
      tierName: "balanced",
    });
    expect(groupResult.isOk()).toBe(true);

    expect(await listUserAllowedTierNames(auth)).toEqual([
      { userId: user.sId, maxTierName: "balanced" },
    ]);
    expect(await listGroupAllowedTierNames(auth)).toContainEqual({
      groupId: group.sId,
      maxTierName: "balanced",
    });
  });

  it("rejects a group tier override on a regular_auto group", async () => {
    const autoGroup = await GroupFactory.regularAuto(workspace, "auto");

    const result = await setGroupMaxAllowedTier(auth, {
      groupId: autoGroup.sId,
      tierName: "premium",
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      // A regular auto group cannot be read without its resource,
      // so the fetch turns it away before the kind check.
      expect(result.error.code).toBe("unauthorized");
    }
    expect(await listGroupAllowedTierNames(auth)).toEqual([]);
  });

  it("manages workspace tier ceiling via set", async () => {
    const setResult = await setWorkspaceMaxAllowedTierName(auth, "balanced");
    expect(setResult.isOk()).toBe(true);
    expect(await listWorkspaceMaxAllowedTierName(auth)).toBe("balanced");
    expect(await listWorkspaceAllowedTierNames(auth)).toEqual(
      expandTiersUpTo("balanced")
    );

    const resetResult = await setWorkspaceMaxAllowedTierName(auth, "premium");
    expect(resetResult.isOk()).toBe(true);
    expect(await listWorkspaceMaxAllowedTierName(auth)).toBe("premium");
    expect(await listWorkspaceAllowedTierNames(auth)).toEqual([
      ...MODELS_TIER_NAMES,
    ]);
  });

  it("resolves allowed tiers for a user from workspace defaults", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const resolved = await resolveAllowedTierNames(userAuth);

    expect(resolved.tiers).toEqual([...MODELS_TIER_NAMES]);
    expect(resolved.source).toBe("workspace");
  });

  it("does not treat workspace grants on the global group as a group override", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    await setWorkspaceMaxAllowedTierName(auth, "balanced");

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const resolved = await resolveAllowedTierNames(userAuth);

    expect(resolved.tiers).toEqual(expandTiersUpTo("balanced"));
    expect(resolved.source).toBe("workspace");
  });

  it("group tier override takes precedence over workspace", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await GroupMembershipModel.create({
      groupId: group.id,
      userId: user.id,
      workspaceId: workspace.id,
      startAt: new Date(),
      status: "active",
    });

    await setWorkspaceMaxAllowedTierName(auth, "premium");
    await setGroupMaxAllowedTier(auth, {
      groupId: group.sId,
      tierName: "balanced",
    });

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const resolved = await resolveAllowedTierNames(userAuth);

    expect(resolved.tiers).toEqual(["cost_efficient", "balanced"]);
    expect(resolved.source).toBe("groups");
  });

  it("user tier override takes precedence over groups and workspace", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await GroupMembershipModel.create({
      groupId: group.id,
      userId: user.id,
      workspaceId: workspace.id,
      startAt: new Date(),
      status: "active",
    });

    await setWorkspaceMaxAllowedTierName(auth, "balanced");
    await setGroupMaxAllowedTier(auth, {
      groupId: group.sId,
      tierName: "premium",
    });
    await setUserMaxAllowedTier(auth, {
      userId: user.sId,
      tierName: "cost_efficient",
    });

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const resolved = await resolveAllowedTierNames(userAuth);

    expect(resolved.tiers).toEqual(["cost_efficient"]);
    expect(resolved.source).toBe("user");
  });
});
