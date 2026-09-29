import {
  AGENT_SEARCH_ALIAS_NAME,
  ElasticsearchError,
  withEs,
} from "@app/lib/api/elasticsearch";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { RichMention } from "@app/types/assistant/mentions";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());

// Mock Elasticsearch so `suggestionsOfMentions` doesn't hit a real cluster.
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  return {
    ...actual,
    withEs: vi.fn(
      async (
        fn: (client: { search: typeof mockSearch }) => Promise<unknown>
      ) => {
        const result = await fn({ search: mockSearch });
        return new Ok(result);
      }
    ),
  };
});

import { honoApp } from "@front-api/app";

beforeEach(() => {
  mockSearch.mockReset();
  mockSearch.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });
});

async function setup() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "user",
  });
  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
    name: "Test Agent",
    description: "Test Agent Description",
  });
  return { workspace, auth, agentConfig };
}

function parse(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/assistant/mentions/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function suggestions(
  workspace: { sId: string },
  query: Record<string, string | string[]>
) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) {
      for (const x of v) {
        search.append(k, x);
      }
    } else {
      search.append(k, v);
    }
  }
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/mentions/suggestions?${search}`
  );
}

describe("POST /api/w/:wId/assistant/mentions/parse", () => {
  it("parses agent mentions in markdown", async () => {
    const { workspace, agentConfig } = await setup();
    const response = await parse(workspace, {
      markdown: `Hello @${agentConfig.name}, can you help me?`,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.markdown).toContain(":mention[");
    expect(body.markdown).toContain(agentConfig.sId);
  });

  it("handles multiple mentions", async () => {
    const { workspace, auth, agentConfig } = await setup();
    const agentConfig2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Another Agent",
      description: "Another Agent Description",
    });

    const response = await parse(workspace, {
      markdown: `Hello @${agentConfig.name} and @${agentConfig2.name}`,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.markdown).toContain(agentConfig.sId);
    expect(body.markdown).toContain(agentConfig2.sId);
  });

  it("handles case-insensitive mentions", async () => {
    const { workspace, agentConfig } = await setup();
    const response = await parse(workspace, {
      markdown: `Hello @${agentConfig.name.toUpperCase()}`,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).markdown).toContain(agentConfig.sId);
  });

  it("does not match partial mentions", async () => {
    const { workspace, agentConfig } = await setup();
    const response = await parse(workspace, {
      markdown: `Hello @${agentConfig.name}Test`,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).markdown).not.toContain(":mention[");
  });

  it("handles mentions at start of text", async () => {
    const { workspace, agentConfig } = await setup();
    const response = await parse(workspace, {
      markdown: `@${agentConfig.name} hello`,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).markdown).toContain(agentConfig.sId);
  });

  it("handles mentions with punctuation", async () => {
    const { workspace, agentConfig } = await setup();
    const response = await parse(workspace, {
      markdown: `Hello @${agentConfig.name}! How are you?`,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).markdown).toContain(agentConfig.sId);
  });

  it("returns 400 for missing markdown field", async () => {
    const { workspace } = await setup();
    const response = await parse(workspace, {});
    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});

describe("GET /api/w/:wId/assistant/mentions/suggestions", () => {
  it("returns agent suggestions", async () => {
    const { workspace, agentConfig } = await setup();
    const response = await suggestions(workspace, { query: "test" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(
      body.suggestions.some(
        (s: { type: string; id: string }) =>
          s.type === "agent" && s.id === agentConfig.sId
      )
    ).toBe(true);
    expect(
      mockSearch.mock.calls.some(
        ([request]) => request.index === AGENT_SEARCH_ALIAS_NAME
      )
    ).toBe(false);
  });

  it("filters suggestions by query", async () => {
    const { workspace, auth } = await setup();
    const alpha = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Alpha Agent",
      description: "Alpha Description",
    });
    const beta = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Beta Agent",
      description: "Beta Description",
    });

    const response = await suggestions(workspace, { query: "alpha" });
    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.suggestions
      .filter((s: { type: string }) => s.type === "agent")
      .map((s: { id: string }) => s.id);
    expect(ids).toContain(alpha.sId);
    expect(ids).not.toContain(beta.sId);
  });

  it("supports select=agents", async () => {
    const { workspace } = await setup();
    const response = await suggestions(workspace, {
      query: "test",
      select: "agents",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.suggestions.filter((s: { type: string }) => s.type === "agent")
        .length
    ).toBeGreaterThan(0);
  });

  it("supports select=users", async () => {
    const { workspace } = await setup();
    const response = await suggestions(workspace, {
      query: "test",
      select: "users",
    });

    expect(response.status).toBe(200);
    expect(Array.isArray((await response.json()).suggestions)).toBe(true);
  });

  it("supports select repeated as agents+users", async () => {
    const { workspace } = await setup();
    const response = await suggestions(workspace, {
      query: "test",
      select: ["agents", "users"],
    });

    expect(response.status).toBe(200);
    expect(Array.isArray((await response.json()).suggestions)).toBe(true);
  });

  it("handles empty query", async () => {
    const { workspace } = await setup();
    const response = await suggestions(workspace, { query: "" });

    expect(response.status).toBe(200);
    expect(Array.isArray((await response.json()).suggestions)).toBe(true);
  });

  it.each([
    "",
    "sal mar",
  ])("uses alphabetically ordered search results with the flag on (query: %s)", async (query) => {
    const { workspace, auth } = await setup();
    await FeatureFlagFactory.basic(auth, "new_manage_agents_page");
    const first = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Alpha Marketing Sales",
    });
    const second = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Beta Marketing Sales",
    });
    const agents = await AgentResource.fetchByIds(auth, [
      first.sId,
      second.sId,
    ]);
    const documents = agents
      .map((agent) =>
        agent.toSearchDocument(auth, {
          activeUsersCount: 0,
          editors: [],
          favoriteCount: 0,
          feedbackNegativeCount: 0,
          feedbackPositiveCount: 0,
          lastEditedByUser: null,
          mcpServerViewIds: [],
          skillIds: [],
          tagIds: [],
        })
      )
      .toSorted((a, b) => a.name.localeCompare(b.name));
    mockSearch.mockImplementation(async (request: estypes.SearchRequest) => ({
      hits: {
        hits:
          request.index === AGENT_SEARCH_ALIAS_NAME
            ? documents.map((document) => ({ _source: document }))
            : [],
        total: {
          value:
            request.index === AGENT_SEARCH_ALIAS_NAME ? documents.length : 0,
        },
      },
    }));

    const response = await suggestions(workspace, { query, select: "agents" });
    expect(response.status).toBe(200);
    const body: { suggestions: RichMention[] } = await response.json();
    expect(body.suggestions.map((agent) => agent.id)).toEqual([
      first.sId,
      second.sId,
    ]);
    expect(body.suggestions[0]).toMatchObject({
      type: "agent",
      label: first.name,
      pictureUrl: first.pictureUrl,
      description: first.description,
    });
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        index: AGENT_SEARCH_ALIAS_NAME,
        size: 20,
        sort: [
          { "name.keyword": { order: "asc", missing: "_last" } },
          { agent_id: { order: "asc" } },
        ],
      })
    );

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: second.sId,
      messagesCreatedAt: [new Date()],
    });
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.user()!.toJSON(),
    });
    const conversationResponse = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}/mentions/suggestions?current=true`
    );
    expect(conversationResponse.status).toBe(200);
    const conversationBody: { suggestions: RichMention[] } =
      await conversationResponse.json();
    expect(conversationBody.suggestions).toEqual([
      expect.objectContaining({
        type: "user",
        id: auth.user()!.sId,
        isParticipant: true,
      }),
      expect.objectContaining({
        type: "agent",
        id: first.sId,
        isParticipant: false,
      }),
      expect.objectContaining({
        type: "agent",
        id: second.sId,
        isParticipant: true,
      }),
    ]);
  });

  it("keeps successful empty search results without falling back to the full listing", async () => {
    const { workspace, auth } = await setup();
    await FeatureFlagFactory.basic(auth, "new_manage_agents_page");
    const response = await suggestions(workspace, {
      query: "",
      select: "agents",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).suggestions).toEqual([]);
    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it("falls back to the legacy lookup when agent search fails", async () => {
    const { workspace, auth, agentConfig } = await setup();
    await FeatureFlagFactory.basic(auth, "new_manage_agents_page");
    vi.mocked(withEs).mockResolvedValueOnce(
      new Err(new ElasticsearchError("connection_error", "Search unavailable"))
    );
    const response = await suggestions(workspace, {
      query: "test",
      select: "agents",
    });
    expect(response.status).toBe(200);
    const body: { suggestions: RichMention[] } = await response.json();
    expect(body.suggestions.map((agent) => agent.id)).toContain(
      agentConfig.sId
    );
  });

  it("does not search agents for user-only requests with the flag on", async () => {
    const { workspace, auth } = await setup();
    await FeatureFlagFactory.basic(auth, "new_manage_agents_page");
    const response = await suggestions(workspace, {
      query: "test",
      select: "users",
    });
    expect(response.status).toBe(200);
    expect(
      mockSearch.mock.calls.some(
        ([request]) => request.index === AGENT_SEARCH_ALIAS_NAME
      )
    ).toBe(false);
  });

  it("keeps Sidekick mentionable when it participates in the conversation", async () => {
    const { workspace, auth } = await setup();
    await FeatureFlagFactory.basic(auth, "new_manage_agents_page");
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.SIDEKICK,
      messagesCreatedAt: [new Date()],
    });
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.user()!.toJSON(),
    });
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}/mentions/suggestions?select=agents`
    );
    expect(response.status).toBe(200);
    expect((await response.json()).suggestions).toEqual([
      expect.objectContaining({
        type: "agent",
        id: GLOBAL_AGENTS_SID.SIDEKICK,
        isParticipant: true,
      }),
    ]);
    const filteredResponse = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}/mentions/suggestions?select=agents&query=unmatched`
    );
    expect(filteredResponse.status).toBe(200);
    expect((await filteredResponse.json()).suggestions).toEqual([]);
  });
});
