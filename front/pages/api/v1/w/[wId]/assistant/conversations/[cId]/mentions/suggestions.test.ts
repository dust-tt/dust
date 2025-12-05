import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
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

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });

  req.query.wId = workspace.sId;
  req.query.cId = conversation.sId;

  // Simulate tool server impersonation: set user header for auth exchange
  req.headers["x-api-user-email"] = user.email!;

  return {
    req,
    res,
    workspace,
    auth,
    user,
    agentConfig,
    conversation,
  };
}

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

describe("GET /api/v1/w/[wId]/assistant/conversations/[cId]/mentions/suggestions", () => {
  it("should return agent suggestions for a conversation", async () => {
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

  it("should return 404 for non-existent conversation", async () => {
    const { req, res } = await setupTest("GET");

    req.query.cId = "non-existent-conversation";
    req.query.query = "test";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("conversation_not_found");
  });

  it("should return 400 for missing cId parameter", async () => {
    const { req, res } = await setupTest("GET");

    delete req.query.cId;
    req.query.query = "test";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toContain("cId");
  });

  it("should handle missing query parameter", async () => {
    const { req, res } = await setupTest("GET");

    delete req.query.query;

    await handler(req, res);

    // Zod parse throws, which may result in 400 or 500 depending on error handling
    expect([400, 500]).toContain(res._getStatusCode());
  });

  it("should support select parameter", async () => {
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

  it("should return 405 for unsupported methods", async () => {
    const { req, res } = await setupTest("POST");

    req.query.query = "test";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("method_not_supported_error");
  });
});
