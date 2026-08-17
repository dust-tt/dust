import { Authenticator } from "@app/lib/auth";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { emptyWorkspacePermissions } from "@app/types/group_permissions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CAPABILITY = { grantType: "create", resourceType: "agent" } as const;
const RESOURCE_TYPE = "agent";
const VERB = "create";

describe("Authenticator.hasWorkspacePermission", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
  });

  // Build a non-admin member of `group` (if given) and return their authenticator.
  async function memberAuthInGroup(
    group?: Awaited<ReturnType<typeof GroupFactory.regularAuto>>
  ): Promise<Authenticator> {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    if (group) {
      await GroupFactory.withMembers(adminAuth, group, [user]);
    }
    return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
  }

  it("returns true for admins unconditionally (no grant needed)", async () => {
    expect(adminAuth.isAdmin()).toBe(true);
    expect(await adminAuth.hasWorkspacePermission(VERB, RESOURCE_TYPE)).toBe(
      true
    );
  });

  it("returns false for a non-admin without any grant", async () => {
    const auth = await memberAuthInGroup();
    expect(auth.isAdmin()).toBe(false);
    expect(await auth.hasWorkspacePermission(VERB, RESOURCE_TYPE)).toBe(false);
  });

  it("returns true when one of the caller's groups holds the -1 grant", async () => {
    const group = await GroupFactory.regularAuto(workspace, "eng");
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group,
      ...CAPABILITY,
    });
    const auth = await memberAuthInGroup(group);

    expect(await auth.hasWorkspacePermission(VERB, RESOURCE_TYPE)).toBe(true);
    // A different verb on the same type is not granted.
    expect(await auth.hasWorkspacePermission("publish", "agent")).toBe(false);
  });

  it("returns true for everybody when the global group holds the grant", async () => {
    const globalGroup = await GroupResource.internalFetchWorkspaceGlobalGroup(
      workspace.id
    );
    if (!globalGroup) {
      throw new Error("global group should exist");
    }
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group: globalGroup,
      ...CAPABILITY,
    });
    const auth = await memberAuthInGroup();

    expect(await auth.hasWorkspacePermission(VERB, RESOURCE_TYPE)).toBe(true);
  });

  it("matches a wildcard grant against any capability", async () => {
    const group = await GroupFactory.regularAuto(workspace, "superadmins");
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group,
      grantType: "*",
      resourceType: "*",
    });
    const auth = await memberAuthInGroup(group);

    expect(await auth.hasWorkspacePermission("admin", "billing")).toBe(true);
    expect(await auth.hasWorkspacePermission("admin", "security")).toBe(true);
  });

  it("rejects an invalid capability query, even for admins", async () => {
    // `create` is not a valid grant type on `billing`; a wildcard grant must not satisfy it.
    await expect(
      adminAuth.hasWorkspacePermission("create", "billing")
    ).rejects.toThrow(/not allowed/);
  });
});

describe("Authenticator.getWorkspacePermissions", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
  });

  // Build a non-admin member of `group` (if given) and return their authenticator.
  async function memberAuthInGroup(
    group?: Awaited<ReturnType<typeof GroupFactory.regularManual>>
  ): Promise<Authenticator> {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    if (group) {
      await GroupFactory.withMembers(adminAuth, group, [user]);
    }
    return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
  }

  it("returns every type-level verb for an admin", async () => {
    // Admins hold every type-level capability by default; instance-only domains
    // (space, models_tier) stay empty.
    expect(await adminAuth.getWorkspacePermissions()).toEqual({
      ...emptyWorkspacePermissions(),
      agent: ["create", "publish"],
      skill: ["create", "publish", "make_discoverable"],
      frame: ["invite", "publish"],
      billing: ["admin"],
      security: ["admin"],
      dust_app: ["admin"],
    });
  });

  it("returns no permissions for a regular user without grants", async () => {
    const auth = await memberAuthInGroup();

    expect(await auth.getWorkspacePermissions()).toEqual(
      emptyWorkspacePermissions()
    );
  });

  it("reflects a capability granted to everyone", async () => {
    await GroupPermissionResource.setForEverybody(adminAuth, {
      grantType: "create",
      resourceType: "agent",
    });
    const auth = await memberAuthInGroup();

    expect(await auth.getWorkspacePermissions()).toEqual({
      ...emptyWorkspacePermissions(),
      agent: ["create"],
    });
  });

  it("reflects a capability granted to a group the user belongs to", async () => {
    const group = await GroupFactory.regularManual(workspace, "A");
    await GroupPermissionResource.setGroups(
      adminAuth,
      { grantType: "publish", resourceType: "agent" },
      [group]
    );
    const auth = await memberAuthInGroup(group);

    expect(await auth.getWorkspacePermissions()).toEqual({
      ...emptyWorkspacePermissions(),
      agent: ["publish"],
    });
  });
});

describe("Authenticator.fromJSON", () => {
  it("resolves the grants of a payload serialized before permissions existed", async () => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );

    const group = await GroupFactory.regularManual(workspace, "A");
    await GroupPermissionResource.setGroups(
      adminAuth,
      { grantType: "publish", resourceType: "agent" },
      [group]
    );

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await GroupFactory.withMembers(adminAuth, group, [user]);
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // In-flight Temporal workflows carry payloads serialized before the permissions field existed.
    const { permissions, ...legacyAuthType } = auth.toJSON();
    expect(permissions).toBeDefined();

    const restored = await Authenticator.fromJSON(legacyAuthType);

    expect(await restored.getWorkspacePermissions()).toEqual(
      await auth.getWorkspacePermissions()
    );
    expect(await restored.hasWorkspacePermission("publish", "agent")).toBe(
      true
    );
  });
});

describe("Authenticator.fromKey permission resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the cache disabled until its global rollout starts", async () => {
    const workspace = await WorkspaceFactory.basic();
    const { systemGroup } = await GroupFactory.defaults(workspace);
    const databaseLookupSpy = vi.spyOn(
      GroupPermissionResource,
      "listForGroups"
    );
    const workspaceCacheSpy = vi.spyOn(
      GroupPermissionResource,
      "listForGroupsFromWorkspaceCache"
    );
    const key = await KeyFactory.system(systemGroup);

    await Authenticator.fromKey(key, workspace.sId);

    expect(databaseLookupSpy).toHaveBeenCalledTimes(1);
    expect(workspaceCacheSpy).not.toHaveBeenCalled();
  });

  it("uses the workspace grant cache for unscoped system keys", async () => {
    const workspace = await WorkspaceFactory.basic();
    const { systemGroup } = await GroupFactory.defaults(workspace);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const includedGroup = await GroupFactory.regularManual(
      workspace,
      "included"
    );
    const excludedGroup = await GroupResource.makeNew({
      name: "excluded",
      kind: "agent_editors",
      workspaceId: workspace.id,
    });
    await GroupPermissionResource.grant(adminAuth, {
      group: includedGroup,
      grantType: "editor",
      resourceType: "agent",
      resourceId: 42,
    });
    await GroupPermissionResource.grant(adminAuth, {
      group: excludedGroup,
      grantType: "editor",
      resourceType: "agent",
      // A different agent, so the excluded group's grant is observable by its absence below.
      resourceId: 99,
    });
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "system_key_permission_cache",
      100
    );

    const workspaceCacheSpy = vi.spyOn(
      GroupPermissionResource,
      "listForGroupsFromWorkspaceCache"
    );
    const key = await KeyFactory.system(systemGroup);
    const { workspaceAuth } = await Authenticator.fromKey(key, workspace.sId);

    // The workspace snapshot cache serves this unscoped system key when the rollout is enabled.
    expect(workspaceCacheSpy).toHaveBeenCalledTimes(1);
    // The in-scope group's grant on agent 42 is loaded; the out-of-scope (agent_editors) group's
    // grant on agent 99 is filtered out of the snapshot — resolved verbs are caller-scoped and
    // carry no group ids.
    expect(workspaceAuth.getGrantedVerbs("agent", 42).length).toBeGreaterThan(
      0
    );
    expect(workspaceAuth.getGrantedVerbs("agent", 99)).toEqual([]);
  });

  it("resolves permissions for explicitly scoped system keys", async () => {
    const workspace = await WorkspaceFactory.basic();
    const { systemGroup } = await GroupFactory.defaults(workspace);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const includedGroup = await GroupFactory.regularManual(
      workspace,
      "included"
    );
    const excludedGroup = await GroupFactory.regularManual(
      workspace,
      "excluded"
    );
    await GroupPermissionResource.grant(adminAuth, {
      group: includedGroup,
      grantType: "editor",
      resourceType: "agent",
      resourceId: 42,
    });
    await GroupPermissionResource.grant(adminAuth, {
      group: excludedGroup,
      grantType: "editor",
      resourceType: "agent",
      // A different agent, so the excluded group's grant is observable by its absence below.
      resourceId: 99,
    });
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "system_key_permission_cache",
      100
    );

    const workspaceCacheSpy = vi.spyOn(
      GroupPermissionResource,
      "listForGroupsFromWorkspaceCache"
    );
    const key = await KeyFactory.system(systemGroup);
    const { workspaceAuth } = await Authenticator.fromKey(key, workspace.sId, [
      includedGroup.sId,
    ]);

    // A scoped key routes through the ordinary database lookup, never the workspace cache — even
    // with the rollout enabled, because the cache only serves unscoped system keys.
    expect(workspaceCacheSpy).not.toHaveBeenCalled();
    // The in-scope group's grant on agent 42 is loaded; the out-of-scope group's grant on agent 99
    // is not — resolved verbs are caller-scoped and carry no group ids.
    expect(workspaceAuth.getGrantedVerbs("agent", 42).length).toBeGreaterThan(
      0
    );
    expect(workspaceAuth.getGrantedVerbs("agent", 99)).toEqual([]);
  });
});

describe("Authenticator.refresh permission resolution", () => {
  it("re-resolves grants for a user-less (system key) auth", async () => {
    const workspace = await WorkspaceFactory.basic();
    const { systemGroup } = await GroupFactory.defaults(workspace);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const group = await GroupFactory.regularManual(workspace, "eng");

    // A system-key auth has no user; its grant snapshot is resolved once at build time. The agent
    // loop freezes it at workflow start and refreshes it on every step.
    const key = await KeyFactory.system(systemGroup);
    const { workspaceAuth } = await Authenticator.fromKey(key, workspace.sId);
    expect(workspaceAuth.getGrantedVerbs("agent", 42)).toEqual([]);

    // A grant lands on one of the key's groups AFTER the auth was built (mirrors a backfill or an
    // updatePermissions write arriving mid-run). `editor` on `agent` confers read + write.
    await GroupPermissionResource.grant(adminAuth, {
      group,
      grantType: "editor",
      resourceType: "agent",
      resourceId: 42,
    });

    // refresh() must observe the new grant even though the auth has no user. Before the fix the
    // `_user`-gated body skipped user-less auths entirely, leaving the stale (empty) snapshot.
    await workspaceAuth.refresh();

    expect([...workspaceAuth.getGrantedVerbs("agent", 42)].sort()).toEqual([
      "read",
      "write",
    ]);
  });
});
