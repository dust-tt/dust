import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import handler from "./suggestions";

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

async function setupTest(method: RequestMethod = "GET") {
  const { req, res, workspace, authenticator } =
    await createPrivateApiMockRequest({
      role: "builder",
      method,
    });

  const agentConfig = await AgentConfigurationFactory.createTestAgent(
    authenticator,
    {
      name: "Test Agent",
      description: "Test Agent Description",
    }
  );

  req.query.wId = workspace.sId;

  return {
    req,
    res,
    workspace,
    auth: authenticator,
    agentConfig,
  };
}

describe("GET /api/w/[wId]/assistant/mentions/suggestions", () => {
  it("should return agent suggestions", async () => {
    const { req, res, agentConfig } = await setupTest("GET");

    req.query.query = "test";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toBeDefined();
    expect(Array.isArray(responseData.suggestions)).toBe(true);
    const agentSuggestion = responseData.suggestions.find(
      (s: { type: string; id: string }) =>
        s.type === "agent" && s.id === agentConfig.sId
    );
    expect(agentSuggestion).toBeDefined();
  });

  it("should filter suggestions by query", async () => {
    const { req, res, auth } = await setupTest("GET");

    const agentConfig1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Alpha Agent",
      description: "Alpha Description",
    });
    const agentConfig2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Beta Agent",
      description: "Beta Description",
    });

    req.query.query = "alpha";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    const suggestions = responseData.suggestions.filter(
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
    const { req, res } = await setupTest("GET");

    req.query.query = "test";
    req.query.select = "agents";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toBeDefined();
    const agentSuggestions = responseData.suggestions.filter(
      (s: { type: string }) => s.type === "agent"
    );
    expect(agentSuggestions.length).toBeGreaterThan(0);
  });

  it("should support select parameter for users only", async () => {
    const { req, res } = await setupTest("GET");

    req.query.query = "test";
    req.query.select = "users";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toBeDefined();
    // Users may or may not be returned depending on feature flags
    expect(Array.isArray(responseData.suggestions)).toBe(true);
  });

  it("should support select parameter as array", async () => {
    const { req, res } = await setupTest("GET");

    req.query.query = "test";
    req.query.select = ["agents", "users"];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toBeDefined();
    expect(Array.isArray(responseData.suggestions)).toBe(true);
  });

  it("should handle empty query", async () => {
    const { req, res } = await setupTest("GET");

    req.query.query = "";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toBeDefined();
    expect(Array.isArray(responseData.suggestions)).toBe(true);
  });

  it("should return 405 for unsupported methods", async () => {
    const { req, res } = await setupTest("POST");

    req.query.query = "test";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("method_not_supported_error");
  });
});
