import { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { CLAUDE_OPUS_4_8_MODEL_ID } from "@app/types/assistant/models/anthropic";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/programmatic_usage/tracking", () => ({
  isProgrammaticUsage: () => false,
  checkProgrammaticUsageLimits: vi.fn(),
}));

function postMessage(
  workspace: { sId: string },
  conversationId: string,
  key: { secret: string },
  body: unknown,
  extraHeaders: Record<string, string> = {}
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key.secret}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    }
  );
}

// `@analyst` is a global agent gated on the `managers` audience, so it only resolves for an
// authenticator carrying an admin or manager role.
async function postAnalystMention(
  workspace: { sId: string },
  key: { secret: string },
  { role, asSubAgent }: { role: MembershipRoleType; asSubAgent: boolean }
) {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role });
  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const conversation = await ConversationFactory.create(userAuth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [],
  });

  return postMessage(
    workspace,
    conversation.sId,
    key,
    {
      content: "Hello",
      mentions: [{ configurationId: GLOBAL_AGENTS_SID.ANALYST }],
      context: {
        username: "sub-agent",
        timezone: "Europe/Paris",
        origin: "api",
      },
      ...(asSubAgent
        ? {
            agenticMessageData: {
              type: "run_agent",
              originMessageId: "msg_parent",
            },
          }
        : {}),
    },
    { "x-api-user-email": user.email }
  );
}

describe("POST /api/v1/w/[wId]/assistant/conversations/[cId]/messages", () => {
  it("returns 401 when an API key (no user) sends selectedMCPServerViewIds", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const response = await postMessage(workspace, conversation.sId, key, {
      content: "Hello",
      mentions: [],
      context: {
        username: "tester",
        timezone: "Europe/Paris",
        origin: "api",
        selectedMCPServerViewIds: ["msv_abcdef123456"],
      },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Selecting MCP server views is only available to authenticated users.",
      },
    });
  });

  it("returns 400 when the request body fails schema validation", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const response = await postMessage(workspace, conversation.sId, key, {
      content: "missing mentions and context",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 when modelSelection references an unknown model", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const response = await postMessage(workspace, conversation.sId, key, {
      content: "Hello",
      mentions: [],
      context: {
        username: "tester",
        timezone: "Europe/Paris",
        origin: "api",
      },
      modelSelection: {
        providerId: "anthropic",
        modelId: "not-a-real-model",
      },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("Invalid modelSelection");
  });

  it("returns 400 when modelSelection has an invalid reasoning effort", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const response = await postMessage(workspace, conversation.sId, key, {
      content: "Hello",
      mentions: [],
      context: {
        username: "tester",
        timezone: "Europe/Paris",
        origin: "api",
      },
      modelSelection: {
        providerId: "anthropic",
        modelId: CLAUDE_OPUS_4_8_MODEL_ID,
        reasoningEffort: "extreme",
      },
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("persists a valid modelSelection as the user message requestedModel", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await FeatureFlagFactory.basic(userAuth, "models_picker");
    await FeatureFlagFactory.basic(userAuth, "claude_4_5_opus_feature");
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const modelSelection = {
      providerId: "anthropic" as const,
      modelId: CLAUDE_OPUS_4_8_MODEL_ID,
      reasoningEffort: "medium" as const,
    };

    const response = await postMessage(workspace, conversation.sId, key, {
      content: "Hello",
      mentions: [],
      context: {
        username: "tester",
        timezone: "Europe/Paris",
        origin: "api",
      },
      modelSelection,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message.requestedModel).toEqual(modelSelection);
  });

  it("rebuilds the posting user from x-api-user-email on a system key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const response = await postMessage(
      workspace,
      conversation.sId,
      key,
      {
        content: "Hello",
        mentions: [],
        // No `context.email`: the only path to an attributed user is the header
        // exchange, so this asserts the auth rebuild and not email attribution.
        context: {
          username: "sub-agent",
          timezone: "Europe/Paris",
          origin: "api",
        },
      },
      { "x-api-user-email": user.email }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message.user?.sId).toBe(user.sId);
  });

  it("leaves the posting user unattributed without x-api-user-email", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const response = await postMessage(workspace, conversation.sId, key, {
      content: "Hello",
      mentions: [],
      context: {
        username: "sub-agent",
        timezone: "Europe/Paris",
        origin: "api",
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message.user).toBeNull();
  });
  it("resolves a role-gated agent for a sub-agent post from an admin", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });

    const response = await postAnalystMention(workspace, key, {
      role: "admin",
      asSubAgent: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).agentMessages).toHaveLength(1);
  });

  it("keeps a role-gated agent out of reach of a sub-agent post from a regular member", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });

    const response = await postAnalystMention(workspace, key, {
      role: "user",
      asSubAgent: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).agentMessages).toHaveLength(0);
  });

  it("leaves impersonated posts outside the sub-agent path capped at the user role", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });

    // No `agenticMessageData`: this is the Slack/Teams/Discord shape, which stays capped at
    // "user" even for an admin.
    const response = await postAnalystMention(workspace, key, {
      role: "admin",
      asSubAgent: false,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).agentMessages).toHaveLength(0);
  });
});
