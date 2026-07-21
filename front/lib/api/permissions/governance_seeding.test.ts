import { seedWorkspaceCapabilities } from "@app/lib/api/permissions/governance_seeding";
import { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("seedWorkspaceCapabilities", () => {
  it("grants create-agent to everybody by default for a fresh workspace", async () => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await seedWorkspaceCapabilities(auth);

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(await userAuth.hasWorkspacePermission("create", "agent")).toBe(true);
  });

  it("creates the Builders group and grants it when disallow_agent_creation_to_users is already set", async () => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    await FeatureFlagResource.enable(
      workspace,
      "disallow_agent_creation_to_users"
    );
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Freshly created workspace: no Builders group has ever been synced yet, so seeding must
    // create it (empty) rather than leaving the capability unconfigured.
    await seedWorkspaceCapabilities(auth);

    const buildersGroup = await GroupResource.fetchByName(auth, "Builders");
    expect(buildersGroup).not.toBeNull();
    expect(buildersGroup?.kind).toBe("regular_manual");

    const plainUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, plainUser, { role: "user" });
    const plainAuth = await Authenticator.fromUserIdAndWorkspaceId(
      plainUser.sId,
      workspace.sId
    );
    expect(await plainAuth.hasWorkspacePermission("create", "agent")).toBe(
      false
    );

    const builder = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builder, { role: "builder" });
    await GroupResource.syncBuilderGroupMembership({
      workspace,
      user: builder,
      isBuilder: true,
    });
    const builderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      builder.sId,
      workspace.sId
    );
    expect(await builderAuth.hasWorkspacePermission("create", "agent")).toBe(
      true
    );
  });

  it("always grants create-skill to the Builders group, regardless of any flag", async () => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await seedWorkspaceCapabilities(auth);

    const plainUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, plainUser, { role: "user" });
    const plainAuth = await Authenticator.fromUserIdAndWorkspaceId(
      plainUser.sId,
      workspace.sId
    );
    expect(await plainAuth.hasWorkspacePermission("create", "skill")).toBe(
      false
    );

    const builder = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builder, { role: "builder" });
    await GroupResource.syncBuilderGroupMembership({
      workspace,
      user: builder,
      isBuilder: true,
    });
    const builderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      builder.sId,
      workspace.sId
    );
    expect(await builderAuth.hasWorkspacePermission("create", "skill")).toBe(
      true
    );
  });
});
