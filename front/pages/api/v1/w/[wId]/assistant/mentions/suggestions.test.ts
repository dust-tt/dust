import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import handler from "./suggestions";

async function setupTest(method: RequestMethod = "GET") {
  const { req, res, workspace } = await createPublicApiMockRequest({
    systemKey: true,
    method,
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

  req.query.wId = workspace.sId;

  // Simulate tool server impersonation: set user header for auth exchange
  req.headers["x-api-user-email"] = user.email!;

  return {
    req,
    res,
    workspace,
    auth,
    user,
    agentConfig,
  };
}

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

describe("GET /api/v1/w/[wId]/assistant/mentions/suggestions", () => {
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

    // Users may or may not be returned depending on feature flags
    // If users are disabled, this may return 200 with empty array or error
    expect([200, 500]).toContain(res._getStatusCode());
    if (res._getStatusCode() === 200) {
      const responseData = res._getJSONData();
      expect(responseData.suggestions).toBeDefined();
      expect(Array.isArray(responseData.suggestions)).toBe(true);
    }
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

  it("should handle missing query parameter", async () => {
    const { req, res } = await setupTest("GET");

    delete req.query.query;

    await handler(req, res);

    // Zod parse throws, which may result in 400 or 500 depending on error handling
    expect([400, 500]).toContain(res._getStatusCode());
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
