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

import handler from "./parse";

async function setupTest(method: RequestMethod = "POST") {
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

describe("POST /api/v1/w/[wId]/assistant/mentions/parse", () => {
  it("should parse agent mentions in markdown", async () => {
    const { req, res, agentConfig } = await setupTest("POST");

    req.body = {
      markdown: `Hello @${agentConfig.name}, can you help me?`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.markdown).toBeDefined();
    expect(responseData.markdown).toContain(":mention[");
    expect(responseData.markdown).toContain(agentConfig.sId);
  });

  it("should handle multiple mentions", async () => {
    const { req, res, auth, agentConfig } = await setupTest("POST");

    const agentConfig2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Another Agent",
      description: "Another Agent Description",
    });

    req.body = {
      markdown: `Hello @${agentConfig.name} and @${agentConfig2.name}`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.markdown).toBeDefined();
    expect(responseData.markdown).toContain(agentConfig.sId);
    expect(responseData.markdown).toContain(agentConfig2.sId);
  });

  it("should handle case-insensitive mentions", async () => {
    const { req, res, agentConfig } = await setupTest("POST");

    req.body = {
      markdown: `Hello @${agentConfig.name.toUpperCase()}`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.markdown).toBeDefined();
    expect(responseData.markdown).toContain(agentConfig.sId);
  });

  it("should not match partial mentions", async () => {
    const { req, res, agentConfig } = await setupTest("POST");

    req.body = {
      markdown: `Hello @${agentConfig.name}Test`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    // Should not match because "Test" is not whitespace or punctuation
    expect(responseData.markdown).not.toContain(":mention[");
  });

  it("should handle mentions at start of text", async () => {
    const { req, res, agentConfig } = await setupTest("POST");

    req.body = {
      markdown: `@${agentConfig.name} hello`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.markdown).toContain(agentConfig.sId);
  });

  it("should handle mentions with punctuation", async () => {
    const { req, res, agentConfig } = await setupTest("POST");

    req.body = {
      markdown: `Hello @${agentConfig.name}! How are you?`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.markdown).toContain(agentConfig.sId);
  });

  it("should handle invalid request body", async () => {
    const { req, res } = await setupTest("POST");

    req.body = null;

    await handler(req, res);

    // Zod parse throws, which may result in 500 or be caught by error handler
    expect([400, 500]).toContain(res._getStatusCode());
  });

  it("should handle missing markdown field", async () => {
    const { req, res } = await setupTest("POST");

    req.body = {};

    await handler(req, res);

    // Zod parse throws, which may result in 400 or 500 depending on error handling
    expect([400, 500]).toContain(res._getStatusCode());
  });

  it("should return 405 for unsupported methods", async () => {
    const { req, res } = await setupTest("GET");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("method_not_supported_error");
  });
});
