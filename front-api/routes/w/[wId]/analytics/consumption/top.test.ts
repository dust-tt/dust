import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  fetchConsumptionTopAgents,
  type GetConsumptionTopAgentsResponse,
} from "@app/lib/api/analytics/consumption/top_agents";
import {
  fetchConsumptionTopApiKeys,
  type GetConsumptionTopApiKeysResponse,
} from "@app/lib/api/analytics/consumption/top_api_keys";
import {
  fetchConsumptionTopConversations,
  type GetConsumptionTopConversationsResponse,
} from "@app/lib/api/analytics/consumption/top_conversations";
import {
  fetchConsumptionTopGroups,
  type GetConsumptionTopGroupsResponse,
} from "@app/lib/api/analytics/consumption/top_groups";
import {
  fetchConsumptionTopModels,
  type GetConsumptionTopModelsResponse,
} from "@app/lib/api/analytics/consumption/top_models";
import {
  fetchConsumptionTopReasoningEfforts,
  type GetConsumptionTopReasoningEffortsResponse,
} from "@app/lib/api/analytics/consumption/top_reasoning_efforts";
import {
  fetchConsumptionTopSkills,
  type GetConsumptionTopSkillsResponse,
} from "@app/lib/api/analytics/consumption/top_skills";
import {
  fetchConsumptionTopSources,
  type GetConsumptionTopSourcesResponse,
} from "@app/lib/api/analytics/consumption/top_sources";
import {
  fetchConsumptionTopTools,
  type GetConsumptionTopToolsResponse,
} from "@app/lib/api/analytics/consumption/top_tools";
import {
  fetchConsumptionTopUsers,
  type GetConsumptionTopUsersResponse,
} from "@app/lib/api/analytics/consumption/top_users";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/api/analytics/consumption/top_agents"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopAgents: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_users"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopUsers: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_api_keys"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopApiKeys: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_models"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopModels: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_reasoning_efforts"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopReasoningEfforts: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_conversations"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopConversations: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_sources"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopSources: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_groups"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopGroups: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_tools"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopTools: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_skills"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopSkills: vi.fn() };
  }
);

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-08-01T00:00:00.000Z",
};

const TOP_AGENTS: GetConsumptionTopAgentsResponse = {
  period: PERIOD,
  totalCredits: 5000,
  totalCount: 1,
  hasMore: false,
  agents: [
    {
      agentId: "agent1",
      name: "@dust",
      pictureUrl: null,
      description: "Answers questions about Dust",
      modelId: "claude-4-sonnet",
      modelDisplayName: "Claude 4 Sonnet",
      credits: 2230,
      previousCredits: null,
      messageCount: 10,
      avgCreditsPerMessage: 223,
    },
  ],
};

const TOP_USERS: GetConsumptionTopUsersResponse = {
  period: PERIOD,
  totalCredits: 5000,
  totalCount: 1,
  hasMore: false,
  users: [
    {
      userId: "user1",
      name: "Jane Doe",
      pictureUrl: null,
      credits: 100,
      previousCredits: null,
      messageCount: 4,
      avgCreditsPerMessage: 25,
    },
  ],
};

const TOP_API_KEYS: GetConsumptionTopApiKeysResponse = {
  period: PERIOD,
  totalCredits: 5000,
  totalCount: 1,
  hasMore: false,
  apiKeys: [
    {
      apiKeyName: "Production key",
      name: "Production key",
      credits: 100,
      previousCredits: null,
      messageCount: 4,
      avgCreditsPerMessage: 25,
    },
  ],
};

const TOP_CONVERSATIONS: GetConsumptionTopConversationsResponse = {
  period: PERIOD,
  conversations: [
    {
      conversationId: "conversation1",
      title: "Quarterly report",
      totalCredits: 420,
    },
  ],
};

const TOP_MODELS: GetConsumptionTopModelsResponse = {
  period: PERIOD,
  totalCredits: 5000,
  totalCount: 1,
  hasMore: false,
  models: [
    {
      modelId: "claude-4-sonnet",
      name: "Claude 4 Sonnet",
      credits: 400,
      previousCredits: null,
      messageCount: 8,
      avgCreditsPerMessage: 50,
    },
  ],
};

const TOP_REASONING_EFFORTS: GetConsumptionTopReasoningEffortsResponse = {
  period: PERIOD,
  totalCredits: 5000,
  totalCount: 2,
  hasMore: false,
  reasoningEfforts: [
    {
      reasoningEffort: "medium",
      name: "Medium",
      credits: 300,
      previousCredits: null,
      messageCount: 6,
      avgCreditsPerMessage: 50,
    },
  ],
};

const TOP_SOURCES: GetConsumptionTopSourcesResponse = {
  period: PERIOD,
  totalCredits: 5000,
  totalCount: 1,
  hasMore: false,
  sources: [
    {
      source: "web",
      name: "Conversation",
      credits: 300,
      previousCredits: null,
      messageCount: 6,
      avgCreditsPerMessage: 50,
    },
  ],
};

const TOP_GROUPS: GetConsumptionTopGroupsResponse = {
  period: PERIOD,
  totalCredits: 5000,
  totalActiveMembers: 8,
  totalCount: 1,
  hasMore: false,
  groups: [
    {
      groupId: "group1",
      name: "Engineering",
      credits: 200,
      activeMembers: 3,
      totalMembers: 5,
      previousCredits: null,
      messageCount: 4,
      avgCreditsPerMessage: 50,
    },
  ],
};

const TOP_TOOLS: GetConsumptionTopToolsResponse = {
  period: PERIOD,
  totalCredits: 5000,
  totalCount: 1,
  hasMore: false,
  tools: [
    {
      serverName: "web_search_browse",
      name: "Web Search & Browse",
      icon: "Globe01Icon",
      credits: 60,
      previousCredits: null,
      invocationCount: 12,
      avgCreditsPerInvocation: 5,
    },
  ],
};

const TOP_SKILLS: GetConsumptionTopSkillsResponse = {
  period: PERIOD,
  totalCredits: 5000,
  totalCount: 1,
  hasMore: false,
  skills: [
    {
      skillId: "skl_1",
      name: "Research",
      description: "Researches a topic in depth",
      icon: "search",
      credits: 40,
      previousCredits: null,
      invocationCount: 8,
      avgCreditsPerInvocation: 5,
    },
  ],
};

// One entry per ranking endpoint. Each owns its own typed mock plumbing so the
// table stays type-safe across eight different response shapes.
const RANKINGS = [
  {
    path: "top-agents",
    body: TOP_AGENTS,
    arrangeOk: () =>
      vi
        .mocked(fetchConsumptionTopAgents)
        .mockResolvedValue(new Ok(TOP_AGENTS)),
    lastCall: () => vi.mocked(fetchConsumptionTopAgents).mock.lastCall,
  },
  {
    path: "top-users",
    body: TOP_USERS,
    arrangeOk: () =>
      vi.mocked(fetchConsumptionTopUsers).mockResolvedValue(new Ok(TOP_USERS)),
    lastCall: () => vi.mocked(fetchConsumptionTopUsers).mock.lastCall,
  },
  {
    path: "top-api-keys",
    body: TOP_API_KEYS,
    arrangeOk: () =>
      vi
        .mocked(fetchConsumptionTopApiKeys)
        .mockResolvedValue(new Ok(TOP_API_KEYS)),
    lastCall: () => vi.mocked(fetchConsumptionTopApiKeys).mock.lastCall,
  },
  {
    path: "top-models",
    body: TOP_MODELS,
    arrangeOk: () =>
      vi
        .mocked(fetchConsumptionTopModels)
        .mockResolvedValue(new Ok(TOP_MODELS)),
    lastCall: () => vi.mocked(fetchConsumptionTopModels).mock.lastCall,
  },
  {
    path: "top-reasoning-efforts",
    body: TOP_REASONING_EFFORTS,
    arrangeOk: () =>
      vi
        .mocked(fetchConsumptionTopReasoningEfforts)
        .mockResolvedValue(new Ok(TOP_REASONING_EFFORTS)),
    lastCall: () =>
      vi.mocked(fetchConsumptionTopReasoningEfforts).mock.lastCall,
  },
  {
    path: "top-sources",
    body: TOP_SOURCES,
    arrangeOk: () =>
      vi
        .mocked(fetchConsumptionTopSources)
        .mockResolvedValue(new Ok(TOP_SOURCES)),
    lastCall: () => vi.mocked(fetchConsumptionTopSources).mock.lastCall,
  },
  {
    path: "top-groups",
    body: TOP_GROUPS,
    arrangeOk: () =>
      vi
        .mocked(fetchConsumptionTopGroups)
        .mockResolvedValue(new Ok(TOP_GROUPS)),
    lastCall: () => vi.mocked(fetchConsumptionTopGroups).mock.lastCall,
  },
  {
    path: "top-tools",
    body: TOP_TOOLS,
    arrangeOk: () =>
      vi.mocked(fetchConsumptionTopTools).mockResolvedValue(new Ok(TOP_TOOLS)),
    lastCall: () => vi.mocked(fetchConsumptionTopTools).mock.lastCall,
  },
  {
    path: "top-skills",
    body: TOP_SKILLS,
    arrangeOk: () =>
      vi
        .mocked(fetchConsumptionTopSkills)
        .mockResolvedValue(new Ok(TOP_SKILLS)),
    lastCall: () => vi.mocked(fetchConsumptionTopSkills).mock.lastCall,
  },
];

const PERSONAL_RANKINGS = RANKINGS.filter(
  ({ path }) => path !== "top-users" && path !== "top-groups"
);
const AGENT_RANKINGS = RANKINGS.filter(({ path }) => path !== "top-agents");

async function setupTest({
  role = "admin",
}: {
  role?: MembershipRoleType;
} = {}) {
  return createPrivateApiMockRequest({ role });
}

function postRankingRequest(
  wId: string,
  path: string,
  body: Record<string, unknown> = {},
  personal = false,
  agentId?: string
) {
  const analyticsPath = agentId
    ? `assistant/agent_configurations/${agentId}/analytics`
    : personal
      ? "me/analytics"
      : "analytics";
  return honoApp.request(`/api/w/${wId}/${analyticsPath}/consumption/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/analytics/consumption/top-*", () => {
  it.each(
    RANKINGS
  )("$path is mounted, returns the ranking and defaults its period and limit", async ({
    path,
    body,
    arrangeOk,
    lastCall,
  }) => {
    arrangeOk();
    const { workspace } = await setupTest({ role: "admin" });

    const response = await postRankingRequest(workspace.sId, path);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    // The period is resolved by the route, so only its shape is asserted here.
    expect(lastCall()?.[1]).toEqual({
      limit: 10,
      offset: 0,
      period: { startDate: expect.any(String), endDate: expect.any(String) },
      search: undefined,
      filter: {},
      sortOrder: "desc",
    });
  });

  it.each(RANKINGS)("$path is refused to non-managers", async ({ path }) => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postRankingRequest(workspace.sId, path);

    expect(response.status).toBe(403);
  });

  it.each(
    PERSONAL_RANKINGS
  )("$path lets members read only their own consumption", async ({
    path,
    arrangeOk,
    lastCall,
  }) => {
    arrangeOk();
    const { workspace, user } = await setupTest({ role: "user" });

    const response = await postRankingRequest(
      workspace.sId,
      path,
      { filter: { users: ["another-user"], sources: ["slack"] } },
      true
    );

    expect(response.status).toBe(200);
    expect(lastCall()?.[1]).toEqual(
      expect.objectContaining({
        filter: { users: [user.sId], sources: ["slack"] },
      })
    );
  });

  it.each([
    "top-users",
    "top-groups",
  ])("%s is not mounted for personal analytics", async (path) => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postRankingRequest(workspace.sId, path, {}, true);

    expect(response.status).toBe(404);
  });

  it.each(
    AGENT_RANKINGS
  )("$path lets editors rank only the selected agent's consumption", async ({
    path,
    arrangeOk,
    lastCall,
  }) => {
    arrangeOk();
    const { auth, workspace } = await setupTest({ role: "user" });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await postRankingRequest(
      workspace.sId,
      path,
      { filter: { agents: ["another-agent"], sources: ["slack"] } },
      false,
      agent.sId
    );

    expect(response.status).toBe(200);
    expect(lastCall()?.[1]).toEqual(
      expect.objectContaining({
        filter: { agents: [agent.sId], sources: ["slack"] },
      })
    );
  });

  it("does not mount the agent ranking for agent-scoped analytics", async () => {
    const { auth, workspace } = await setupTest({ role: "user" });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await postRankingRequest(
      workspace.sId,
      "top-agents",
      {},
      false,
      agent.sId
    );

    expect(response.status).toBe(404);
  });

  it("forwards the page, the period, the search and the filter", async () => {
    vi.mocked(fetchConsumptionTopAgents).mockResolvedValue(new Ok(TOP_AGENTS));
    const { workspace } = await setupTest();

    const response = await postRankingRequest(workspace.sId, "top-agents", {
      limit: 5,
      offset: 995,
      period: "days",
      days: 7,
      search: "  Agent 080  ",
      filter: { sources: ["slack"] },
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionTopAgents)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 5,
        offset: 995,
        search: "Agent 080",
        filter: { sources: ["slack"] },
      })
    );
  });

  it("forwards search to the API key ranking", async () => {
    vi.mocked(fetchConsumptionTopApiKeys).mockResolvedValue(
      new Ok(TOP_API_KEYS)
    );
    const { workspace } = await setupTest();

    const response = await postRankingRequest(workspace.sId, "top-api-keys", {
      search: "  Production key  ",
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionTopApiKeys)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ search: "Production key" })
    );
  });

  it("normalizes a null limit to the default", async () => {
    vi.mocked(fetchConsumptionTopAgents).mockResolvedValue(new Ok(TOP_AGENTS));
    const { workspace } = await setupTest();

    const response = await postRankingRequest(workspace.sId, "top-agents", {
      limit: null,
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionTopAgents)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 10 })
    );
  });

  it("returns 400 on a limit above the cap", async () => {
    const { workspace } = await setupTest();

    const response = await postRankingRequest(workspace.sId, "top-agents", {
      limit: 1000,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchConsumptionTopTools).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { workspace } = await setupTest();

    const response = await postRankingRequest(workspace.sId, "top-tools");

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });

  it("returns the member's most expensive conversations", async () => {
    vi.mocked(fetchConsumptionTopConversations).mockResolvedValue(
      new Ok(TOP_CONVERSATIONS)
    );
    const { workspace, user } = await setupTest({ role: "user" });

    const response = await postRankingRequest(
      workspace.sId,
      "top-conversations",
      {
        period: "days",
        days: 7,
        filter: { users: ["another-user"], sources: ["web"] },
      },
      true
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(TOP_CONVERSATIONS);
    expect(fetchConsumptionTopConversations).toHaveBeenCalledWith(
      expect.anything(),
      {
        period: { startDate: expect.any(String), endDate: expect.any(String) },
        limit: 10,
        filter: { users: [user.sId], sources: ["web"] },
      }
    );
  });

  it("does not mount top conversations on workspace analytics", async () => {
    const { workspace } = await setupTest({ role: "admin" });

    const response = await postRankingRequest(
      workspace.sId,
      "top-conversations"
    );

    expect(response.status).toBe(404);
  });

  it("returns 500 when the conversation ranking fails", async () => {
    vi.mocked(fetchConsumptionTopConversations).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { workspace } = await setupTest({ role: "user" });

    const response = await postRankingRequest(
      workspace.sId,
      "top-conversations",
      {},
      true
    );

    expect(response.status).toBe(500);
  });
});
