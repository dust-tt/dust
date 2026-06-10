import { TOOLS } from "@app/lib/api/actions/servers/workspace_analytics/tools";
import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

function getToolByName(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

function createTestExtra(auth: Authenticator) {
  return {
    signal: new AbortController().signal,
    auth,
    agentLoopContext: undefined,
  } as Parameters<(typeof TOOLS)[0]["handler"]>[1];
}

describe("workspace_analytics tools", () => {
  it.each([
    "get_top_agents",
    "get_top_users",
    "get_agent_details",
    "get_top_skills",
  ])("%s refuses non-admin callers", async (toolName) => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(auth.isAdmin()).toBe(false);

    const tool = getToolByName(toolName);
    const result = await tool.handler({}, createTestExtra(auth));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("admins");
    }
  });
});
