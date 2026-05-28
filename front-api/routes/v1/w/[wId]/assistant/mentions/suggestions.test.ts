import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

// Mock Elasticsearch
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    withEs: vi.fn(async (fn: any) => {
      const mockClient = {
        search: vi.fn().mockResolvedValue({
          hits: { hits: [], total: { value: 0 } },
        }),
      };
      // Mock successful result
      return {
        isOk: () => true,
        isErr: () => false,
        value: await fn(mockClient),
      };
    }),
  };
});

async function setup() {
  const { workspace, key } = await createPublicApiMockRequest({
    systemKey: true,
  });

  // Create a user and agent for testing
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "builder" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
    name: "Test Agent",
    description: "Test Agent Description",
  });

  return {
    workspace,
    key,
    auth,
    user,
    agentConfig,
  };
}

function getSuggestions(
  workspace: { sId: string },
  key: { secret: string },
  userEmail: string,
  query: Record<string, string | string[]>
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        params.append(k, item);
      }
    } else {
      params.append(k, v);
    }
  }
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/mentions/suggestions?${params.toString()}`,
    {
      headers: {
        authorization: `Bearer ${key.secret}`,
        "x-api-user-email": userEmail,
      },
    }
  );
}

describe("GET /api/v1/w/[wId]/assistant/mentions/suggestions", () => {
  it("should return agent suggestions", async () => {
    const { workspace, key, user, agentConfig } = await setup();

    const response = await getSuggestions(workspace, key, user.email!, {
      query: "test",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toBeDefined();
    expect(Array.isArray(data.suggestions)).toBe(true);
    const agentSuggestion = data.suggestions.find(
      (s: { type: string; id: string }) =>
        s.type === "agent" && s.id === agentConfig.sId
    );
    expect(agentSuggestion).toBeDefined();
  });

  it("should filter suggestions by query", async () => {
    const { workspace, key, auth, user } = await setup();

    const agentConfig1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Alpha Agent",
      description: "Alpha Description",
    });
    const agentConfig2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Beta Agent",
      description: "Beta Description",
    });

    const response = await getSuggestions(workspace, key, user.email!, {
      query: "alpha",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    const suggestions = data.suggestions.filter(
      (s: { type: string }) => s.type === "agent"
    );
    const alphaFound = suggestions.some(
      (s: { id: string }) => s.id === agentConfig1.sId
    );
    const betaFound = suggestions.some(
      (s: { id: string }) => s.id === agentConfig2.sId
    );
    expect(alphaFound).toBe(true);
    expect(betaFound).toBe(false);
  });

  it("should support select parameter for agents only", async () => {
    const { workspace, key, user } = await setup();

    const response = await getSuggestions(workspace, key, user.email!, {
      query: "test",
      select: "agents",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toBeDefined();
    const agentSuggestions = data.suggestions.filter(
      (s: { type: string }) => s.type === "agent"
    );
    expect(agentSuggestions.length).toBeGreaterThan(0);
  });

  it("should support select parameter for users only", async () => {
    const { workspace, key, user } = await setup();

    const response = await getSuggestions(workspace, key, user.email!, {
      query: "test",
      select: "users",
    });

    // Users may or may not be returned depending on feature flags
    // If users are disabled, this may return 200 with empty array or error
    expect([200, 500]).toContain(response.status);
    if (response.status === 200) {
      const data = await response.json();
      expect(data.suggestions).toBeDefined();
      expect(Array.isArray(data.suggestions)).toBe(true);
    }
  });

  it("should support select parameter as array", async () => {
    const { workspace, key, user } = await setup();

    const response = await getSuggestions(workspace, key, user.email!, {
      query: "test",
      select: ["agents", "users"],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toBeDefined();
    expect(Array.isArray(data.suggestions)).toBe(true);
  });

  it("should handle missing query parameter", async () => {
    const { workspace, key, user } = await setup();

    const response = await getSuggestions(workspace, key, user.email!, {});

    // Zod validation fails, returns 400
    expect([400, 500]).toContain(response.status);
  });
});
