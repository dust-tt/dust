import type { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

import { TOOLS } from ".";

function getListWorkspaceMembersTool() {
  const tool = TOOLS.find(
    (candidate) => candidate.name === "list_workspace_members"
  );
  if (!tool) {
    throw new Error("list_workspace_members tool not found");
  }
  return tool;
}

function createTestExtra(auth: Authenticator) {
  return {
    signal: new AbortController().signal,
    auth,
  } as Parameters<ReturnType<typeof getListWorkspaceMembersTool>["handler"]>[1];
}

describe("list_workspace_members", () => {
  it("rejects lookups from a non-admin", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const targetUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, targetUser, { role: "user" });

    const result = await getListWorkspaceMembersTool().handler(
      { userIds: [targetUser.sId] },
      createTestExtra(authenticator)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Only workspace admins");
    }
  });

  it("rejects calls with both userIds and jobType", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const targetUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, targetUser, { role: "user" });

    const result = await getListWorkspaceMembersTool().handler(
      { userIds: [targetUser.sId], jobType: "engineering" },
      createTestExtra(authenticator)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("not both");
    }
  });

  it("rejects calls with neither userIds nor jobType", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const result = await getListWorkspaceMembersTool().handler(
      {},
      createTestExtra(authenticator)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("either");
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

    const result = await getListWorkspaceMembersTool().handler(
      { userIds: [salesUser.sId, engineeringUser.sId] },
      createTestExtra(authenticator)
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [content] = result.value;
      expect(content.type).toBe("text");
      if (content.type === "text") {
        const parsed = JSON.parse(content.text);
        expect(parsed.nextPageCursor).toBeNull();
        const memberIds = parsed.members.map(
          (m: { userId: string }) => m.userId
        );
        expect(memberIds).toContain(salesUser.sId);
        expect(memberIds).toContain(engineeringUser.sId);
        const sales = parsed.members.find(
          (m: { userId: string }) => m.userId === salesUser.sId
        );
        expect(sales.jobFunction.value).toBe("sales");
        expect(sales.groups).toContain("Enterprise Sales");
      }
    }
  });

  it("returns only members matching a jobType filter", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const salesUser = await UserFactory.basic();
    const engineeringUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, salesUser, { role: "user" });
    await MembershipFactory.associate(workspace, engineeringUser, {
      role: "user",
    });
    await salesUser.setMetadata("job_type", "sales");
    await engineeringUser.setMetadata("job_type", "engineering");

    const result = await getListWorkspaceMembersTool().handler(
      { jobType: "sales" },
      createTestExtra(authenticator)
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [content] = result.value;
      expect(content.type).toBe("text");
      if (content.type === "text") {
        const parsed = JSON.parse(content.text);
        const memberIds = parsed.members.map(
          (m: { userId: string }) => m.userId
        );
        expect(memberIds).toContain(salesUser.sId);
        expect(memberIds).not.toContain(engineeringUser.sId);
      }
    }
  });
});
