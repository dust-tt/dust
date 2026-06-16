import { canRoleSeeAudience } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { describe, expect, it } from "vitest";

async function authForRole(role: MembershipRoleType): Promise<Authenticator> {
  const workspace = await WorkspaceFactory.basic();
  await GroupFactory.defaults(workspace);
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role });
  return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
}

describe("canRoleSeeAudience", () => {
  it("makes 'everyone' visible to every role", async () => {
    for (const role of ["admin", "builder", "user"] as const) {
      const auth = await authForRole(role);
      expect(canRoleSeeAudience("everyone", auth)).toBe(true);
    }
  });

  it("makes 'builders' visible to builders and admins, not users", async () => {
    expect(canRoleSeeAudience("builders", await authForRole("admin"))).toBe(
      true
    );
    expect(canRoleSeeAudience("builders", await authForRole("builder"))).toBe(
      true
    );
    expect(canRoleSeeAudience("builders", await authForRole("user"))).toBe(
      false
    );
  });

  it("makes 'admins' visible to admins only", async () => {
    expect(canRoleSeeAudience("admins", await authForRole("admin"))).toBe(true);
    expect(canRoleSeeAudience("admins", await authForRole("builder"))).toBe(
      false
    );
    expect(canRoleSeeAudience("admins", await authForRole("user"))).toBe(false);
  });
});
