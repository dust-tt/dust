import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest() {
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

function parseMentions(
  workspace: { sId: string },
  key: { secret: string },
  user: { email: string | null },
  body: unknown,
  method: string = "POST"
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/mentions/parse`,
    {
      method,
      headers: {
        authorization: `Bearer ${key.secret}`,
        "content-type": "application/json",
        // Simulate tool server impersonation: set user header for auth exchange
        ...(user.email ? { "x-api-user-email": user.email } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );
}

describe("POST /api/v1/w/[wId]/assistant/mentions/parse", () => {
  it("should parse agent mentions in markdown", async () => {
    const { workspace, key, user, agentConfig } = await setupTest();

    const response = await parseMentions(workspace, key, user, {
      markdown: `Hello @${agentConfig.name}, can you help me?`,
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.markdown).toBeDefined();
    expect(responseData.markdown).toContain(":mention[");
    expect(responseData.markdown).toContain(agentConfig.sId);
  });

  it("should handle multiple mentions", async () => {
    const { workspace, key, user, auth, agentConfig } = await setupTest();

    const agentConfig2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Another Agent",
      description: "Another Agent Description",
    });

    const response = await parseMentions(workspace, key, user, {
      markdown: `Hello @${agentConfig.name} and @${agentConfig2.name}`,
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.markdown).toBeDefined();
    expect(responseData.markdown).toContain(agentConfig.sId);
    expect(responseData.markdown).toContain(agentConfig2.sId);
  });

  it("should handle case-insensitive mentions", async () => {
    const { workspace, key, user, agentConfig } = await setupTest();

    const response = await parseMentions(workspace, key, user, {
      markdown: `Hello @${agentConfig.name.toUpperCase()}`,
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.markdown).toBeDefined();
    expect(responseData.markdown).toContain(agentConfig.sId);
  });

  it("should not match partial mentions", async () => {
    const { workspace, key, user, agentConfig } = await setupTest();

    const response = await parseMentions(workspace, key, user, {
      markdown: `Hello @${agentConfig.name}Test`,
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    // Should not match because "Test" is not whitespace or punctuation
    expect(responseData.markdown).not.toContain(":mention[");
  });

  it("should handle mentions at start of text", async () => {
    const { workspace, key, user, agentConfig } = await setupTest();

    const response = await parseMentions(workspace, key, user, {
      markdown: `@${agentConfig.name} hello`,
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.markdown).toContain(agentConfig.sId);
  });

  it("should handle mentions with punctuation", async () => {
    const { workspace, key, user, agentConfig } = await setupTest();

    const response = await parseMentions(workspace, key, user, {
      markdown: `Hello @${agentConfig.name}! How are you?`,
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.markdown).toContain(agentConfig.sId);
  });

  it("should handle missing markdown field", async () => {
    const { workspace, key, user } = await setupTest();

    const response = await parseMentions(workspace, key, user, {});

    expect(response.status).toBe(400);
  });
});
