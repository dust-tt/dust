import type { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

import { TOOLS } from ".";

function getWorkspaceMembersContextTool() {
  const tool = TOOLS.find(
    (candidate) => candidate.name === "get_workspace_members_context"
  );
  if (!tool) {
    throw new Error("get_workspace_members_context tool not found");
  }
  return tool;
}

function createTestExtra(auth: Authenticator) {
  return {
    signal: new AbortController().signal,
    auth,
  } as Parameters<
    ReturnType<typeof getWorkspaceMembersContextTool>["handler"]
  >[1];
}

describe("get_workspace_members_context", () => {
  it("does not expose a separate single-member tool", () => {
    const toolNames: string[] = TOOLS.map((tool) => tool.name);
    expect(toolNames).not.toContain("get_workspace_member_context");
  });

  it("rejects lookups from a non-admin", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const targetUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, targetUser, { role: "user" });

    const result = await getWorkspaceMembersContextTool().handler(
      { userIds: [targetUser.sId] },
      createTestExtra(authenticator)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Only workspace admins");
    }
  });

  it("returns role, job function, and groups for a member batch", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const salesUser = await UserFactory.basic();
    const engineeringUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, salesUser, {
      role: "builder",
    });
    await MembershipFactory.associate(workspace, engineeringUser, {
      role: "user",
    });
    await salesUser.setMetadata("job_type", "sales");
    await engineeringUser.setMetadata("job_type", "engineering");
    const group = await GroupFactory.regularManual(
      workspace,
      "Enterprise Sales"
    );
    await GroupFactory.withMembers(authenticator, group, [salesUser]);

    const result = await getWorkspaceMembersContextTool().handler(
      { userIds: [salesUser.sId, engineeringUser.sId] },
      createTestExtra(authenticator)
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [content] = result.value;
      expect(content.type).toBe("text");
      if (content.type === "text") {
        expect(content.text).toContain(`"userId":"${salesUser.sId}"`);
        expect(content.text).toContain('"value":"sales"');
        expect(content.text).toContain('"groups":["Enterprise Sales"]');
        expect(content.text).toContain(`"userId":"${engineeringUser.sId}"`);
        expect(content.text).toContain('"value":"engineering"');
      }
    }
  });
});
