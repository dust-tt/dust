import { seedWorkspaceCapabilities } from "@app/lib/api/permissions/governance_seeding";
import { Authenticator } from "@app/lib/auth";
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

  it("leaves create-skill as admins_only when no Builders group exists yet", async () => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await seedWorkspaceCapabilities(auth);

    expect(await GroupResource.fetchByName(auth, "Builders")).toBeNull();

    const plainUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, plainUser, { role: "user" });
    const plainAuth = await Authenticator.fromUserIdAndWorkspaceId(
      plainUser.sId,
      workspace.sId
    );
    expect(await plainAuth.hasWorkspacePermission("create", "skill")).toBe(
      false
    );
  });

  it("grants create-skill to the Builders group when it already exists", async () => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    const builder = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builder, { role: "builder" });
    await GroupResource.syncBuilderGroupMembership({
      workspace,
      user: builder,
      isBuilder: true,
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await seedWorkspaceCapabilities(auth);

    const builderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      builder.sId,
      workspace.sId
    );
    expect(await builderAuth.hasWorkspacePermission("create", "skill")).toBe(
      true
    );

    const plainUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, plainUser, { role: "user" });
    const plainAuth = await Authenticator.fromUserIdAndWorkspaceId(
      plainUser.sId,
      workspace.sId
    );
    expect(await plainAuth.hasWorkspacePermission("create", "skill")).toBe(
      false
    );
  });
});
