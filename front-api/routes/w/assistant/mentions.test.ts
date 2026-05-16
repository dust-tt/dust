import { describe, expect, it, vi } from "vitest";

import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

// Mock Elasticsearch so `suggestionsOfMentions` doesn't hit a real cluster.
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    withEs: vi.fn(async (fn: any) => {
      const mockClient = {
        search: vi
          .fn()
          .mockResolvedValue({ hits: { hits: [], total: { value: 0 } } }),
      };
      return {
        isOk: () => true,
        isErr: () => false,
        value: await fn(mockClient),
      };
    }),
  };
});

import { honoApp } from "../../../app";

async function setup() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "builder",
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
});
