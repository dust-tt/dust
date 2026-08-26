import { TOOLS } from "@app/lib/api/actions/servers/workspace_analytics/tools";
import { fetchAnalystCreditUsage } from "@app/lib/api/analytics/analyst/credits";
import {
  fetchAnalystTopSkills,
  fetchAnalystTopTools,
} from "@app/lib/api/analytics/analyst/top_invocations";
import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/analytics/analyst/credits"), async (orig) => {
  const mod = await orig();
  return { ...mod, fetchAnalystCreditUsage: vi.fn() };
});

vi.mock(
  import("@app/lib/api/analytics/analyst/top_invocations"),
  async (orig) => {
    const mod = await orig();
    return {
      ...mod,
      fetchAnalystTopSkills: vi.fn(),
      fetchAnalystTopTools: vi.fn(),
    };
  }
);

function getToolByName(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

function createTestExtra(auth: Authenticator, runContext?: unknown) {
  return {
    signal: new AbortController().signal,
    auth,
    runContext,
  } as Parameters<(typeof TOOLS)[0]["handler"]>[1];
}

describe("workspace_analytics tools", () => {
  it.each([
    "get_top_agents",
    "get_top_users",
    "get_top_agent_tags",
    "get_top_models",
    "get_agent_details",
    "get_top_skills",
    "get_top_tools",
    "get_source_breakdown",
    "get_credit_usage",
    "get_credit_timeseries",
    "get_usage_timeseries",
  ])("%s refuses callers below manager", async (toolName) => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(auth.isManager()).toBe(false);

    const tool = getToolByName(toolName);
    const result = await tool.handler({}, createTestExtra(auth));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("admins");
    }
  });
});

describe("get_credit_usage rendering", () => {
  beforeEach(() => {
    vi.mocked(fetchAnalystCreditUsage).mockReset();
  });

  async function managerAuth() {
    const workspace = await WorkspaceFactory.basic();
    return Authenticator.internalAdminForWorkspace(workspace.sId);
  }

  it("reports no data when total credits are zero", async () => {
    const auth = await managerAuth();
    vi.mocked(fetchAnalystCreditUsage).mockResolvedValue(
      new Ok({ totalCredits: 0, rows: [] })
    );

    const tool = getToolByName("get_credit_usage");
    const result = await tool.handler(
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      createTestExtra(auth)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      {
        type: "text",
        text: "No credit usage recorded for 2026-07-01 to 2026-07-31 (UTC).",
      },
    ]);
  });

  it("renders the total without a breakdown when groupBy is 'none'", async () => {
    const auth = await managerAuth();
    vi.mocked(fetchAnalystCreditUsage).mockResolvedValue(
      new Ok({ totalCredits: 42, rows: [] })
    );

    const tool = getToolByName("get_credit_usage");
    const result = await tool.handler(
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      createTestExtra(auth)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      {
        type: "text",
        text:
          "Credit usage for 2026-07-01 to 2026-07-31 (UTC): 42 credits. " +
          "These are the workspace's billed credits, the same ones the " +
          "Usage page shows; very recent activity may still be settling.",
      },
    ]);
  });

  it("renders a ranked breakdown when groupBy is set, with no estimate wording", async () => {
    const auth = await managerAuth();
    vi.mocked(fetchAnalystCreditUsage).mockResolvedValue(
      new Ok({
        totalCredits: 42,
        rows: [{ groupKey: "a1", name: "Agent One", totalCredits: 30 }],
      })
    );

    const tool = getToolByName("get_credit_usage");
    const result = await tool.handler(
      { startDate: "2026-07-01", endDate: "2026-07-31", groupBy: "agent" },
      createTestExtra(auth)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    const text = result.value[0]?.type === "text" ? result.value[0].text : "";
    expect(text).toContain(
      "Top agents by credits:\n1. Agent One [a1] — 30 credits"
    );
    expect(text).not.toContain("estimate");
    expect(text).not.toContain("ESTIMATE");
  });
});

describe("get_top_skills rendering", () => {
  beforeEach(() => {
    vi.mocked(fetchAnalystTopSkills).mockReset();
  });

  async function managerAuth() {
    const workspace = await WorkspaceFactory.basic();
    return Authenticator.internalAdminForWorkspace(workspace.sId);
  }

  it("reports no data when there are no rows", async () => {
    const auth = await managerAuth();
    vi.mocked(fetchAnalystTopSkills).mockResolvedValue(new Ok([]));

    const tool = getToolByName("get_top_skills");
    const result = await tool.handler(
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      createTestExtra(auth)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      {
        type: "text",
        text: "No skill usage recorded for 2026-07-01 to 2026-07-31 (UTC).",
      },
    ]);
  });

  it("renders skills without an id in brackets, matching the legacy format", async () => {
    const auth = await managerAuth();
    vi.mocked(fetchAnalystTopSkills).mockResolvedValue(
      new Ok([
        { skillId: "skl_1", skillName: "Deep Research", totalExecutions: 12 },
      ])
    );

    const tool = getToolByName("get_top_skills");
    const result = await tool.handler(
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      createTestExtra(auth)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      {
        type: "text",
        text:
          "Most-used skills for 2026-07-01 to 2026-07-31 (UTC), most used " +
          "first:\n1. Deep Research — 12 executions",
      },
    ]);
  });
});

describe("get_top_tools rendering", () => {
  beforeEach(() => {
    vi.mocked(fetchAnalystTopTools).mockReset();
  });

  async function managerAuth() {
    const workspace = await WorkspaceFactory.basic();
    return Authenticator.internalAdminForWorkspace(workspace.sId);
  }

  it("reports no data when there are no rows", async () => {
    const auth = await managerAuth();
    vi.mocked(fetchAnalystTopTools).mockResolvedValue(new Ok([]));

    const tool = getToolByName("get_top_tools");
    const result = await tool.handler(
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      createTestExtra(auth)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      {
        type: "text",
        text: "No tool usage recorded for 2026-07-01 to 2026-07-31 (UTC).",
      },
    ]);
  });

  it("omits the bracketed server name when the display name already matches it", async () => {
    const auth = await managerAuth();
    vi.mocked(fetchAnalystTopTools).mockResolvedValue(
      new Ok([
        {
          serverName: "custom_server",
          displayName: "custom_server",
          totalExecutions: 4,
        },
      ])
    );

    const tool = getToolByName("get_top_tools");
    const result = await tool.handler(
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      createTestExtra(auth)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    const text = result.value[0]?.type === "text" ? result.value[0].text : "";
    expect(text).toContain("1. custom_server — 4 executions");
  });

  it("shows the server name in brackets when the display name differs", async () => {
    const auth = await managerAuth();
    vi.mocked(fetchAnalystTopTools).mockResolvedValue(
      new Ok([
        {
          serverName: "web_search_&_browse",
          displayName: "Web search & browse",
          totalExecutions: 7,
        },
      ])
    );

    const tool = getToolByName("get_top_tools");
    const result = await tool.handler(
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      createTestExtra(auth)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    const text = result.value[0]?.type === "text" ? result.value[0].text : "";
    expect(text).toContain(
      "1. Web search & browse [web_search_&_browse] — 7 executions"
    );
  });
});
