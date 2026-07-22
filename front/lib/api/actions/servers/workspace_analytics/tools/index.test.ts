import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { WORKSPACE_ANALYTICS_TOOL_HANDLERS } from "@app/lib/api/actions/servers/workspace_analytics/tools";
import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

function createTestExtra(auth: Authenticator, runContext?: unknown) {
  return {
    signal: new AbortController().signal,
    auth,
    runContext,
  } as ToolHandlerExtra;
}

describe("workspace_analytics tools", () => {
  it.each([
    "get_top_agents",
    "get_top_users",
    "get_top_agent_tags",
    "get_agent_details",
    "get_top_skills",
    "get_top_tools",
    "get_source_breakdown",
    "get_credit_usage",
    "get_credit_timeseries",
    "get_usage_timeseries",
  ] as const)("%s refuses non-admin callers", async (toolName) => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(auth.isAdmin()).toBe(false);

    const result = await WORKSPACE_ANALYTICS_TOOL_HANDLERS[toolName](
      {} as never,
      createTestExtra(auth)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("admins");
    }
  });
});
