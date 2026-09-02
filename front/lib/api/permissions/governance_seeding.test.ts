import { seedWorkspaceCapabilities } from "@app/lib/api/permissions/governance_seeding";
import { Authenticator } from "@app/lib/auth";
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
});
