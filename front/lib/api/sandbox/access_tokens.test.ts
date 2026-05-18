import {
  generateSandboxExecToken,
  SANDBOX_TOKEN_PREFIX,
  verifySandboxExecToken,
} from "@app/lib/api/sandbox/access_tokens";
import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { AgentMCPActionType } from "@app/types/actions";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

const TEST_SECRET = "test-sandbox-jwt-secret";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getSandboxJwtSecret: () => TEST_SECRET,
  },
}));

async function setupTest() {
  const user = await UserFactory.basic();
  const workspace = await WorkspaceFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  await SpaceFactory.defaults(auth);

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });

  const sandbox = await SandboxResource.makeNew(auth, {
    conversationId: conversation.id,
    providerId: "test-provider-id",
    status: "running",
  });

  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig,
  });

  const sandboxServer = await InternalMCPServerInMemoryResource.makeNew(auth, {
    name: "sandbox",
    useCase: null,
  });

  const mockAction: AgentMCPActionType = {
    id: agentMessage.agentMessageId,
    sId: generateRandomModelSId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentMessageId: agentMessage.agentMessageId,
    internalMCPServerName: "search",
    toolName: "semantic_search",
    mcpServerId: sandboxServer.id,
    functionCallName: "semantic_search",
    functionCallId: generateRandomModelSId(),
    params: {
      query: "test query",
      relativeTimeFrame: "all",
      dataSources: [],
    },
    citationsAllocated: 0,
    status: "running",
    step: 0,
    executionDurationMs: null,
    displayLabels: null,
  };

  return { auth, agentConfig, agentMessage, conversation, sandbox, mockAction };
}

describe("sandbox access tokens", () => {
  it("round-trip: generate → verify → check claims", async () => {
    const {
      auth,
      agentConfig,
      agentMessage,
      conversation,
      sandbox,
      mockAction,
    } = await setupTest();

    const token = await generateSandboxExecToken(auth, {
      agentConfiguration: agentConfig,
      agentMessage,
      conversation,
      sandbox,
      execId: "test-exec-id",
      sandboxAction: mockAction,
    });

    expect(token.startsWith(SANDBOX_TOKEN_PREFIX)).toBe(true);

    const payload = await verifySandboxExecToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.wId).toBe(auth.getNonNullableWorkspace().sId);
    expect(payload!.cId).toBe(conversation.sId);
    expect(payload!.uId).toBe(auth.getNonNullableUser().sId);
    expect(payload!.aId).toBe(agentConfig.sId);
    expect(payload!.mId).toBe(agentMessage.sId);
    expect(payload!.sbId).toBe(sandbox.sId);
  });

  it("tampered token is rejected", async () => {
    const {
      auth,
      agentConfig,
      agentMessage,
      conversation,
      sandbox,
      mockAction,
    } = await setupTest();

    const token = await generateSandboxExecToken(auth, {
      agentConfiguration: agentConfig,
      agentMessage,
      conversation,
      sandbox,
      execId: "test-exec-id",
      sandboxAction: mockAction,
    });

    // Decode, modify, re-sign with a wrong secret.
    const jwtPart = token.slice(SANDBOX_TOKEN_PREFIX.length);
    const decoded = jwt.decode(jwtPart) as Record<string, unknown>;
    const tampered =
      SANDBOX_TOKEN_PREFIX +
      jwt.sign({ ...decoded, wId: "hacked" }, "wrong-secret", {
        algorithm: "HS256",
      });

    const payload = await verifySandboxExecToken(tampered);
    expect(payload).toBeNull();
  });

  it("token without sbt- prefix is rejected", async () => {
    const {
      auth,
      agentConfig,
      agentMessage,
      conversation,
      sandbox,
      mockAction,
    } = await setupTest();

    const token = await generateSandboxExecToken(auth, {
      agentConfiguration: agentConfig,
      agentMessage,
      conversation,
      sandbox,
      execId: "test-exec-id",
      sandboxAction: mockAction,
    });
    const raw = token.slice(SANDBOX_TOKEN_PREFIX.length);

    expect(await verifySandboxExecToken(raw)).toBeNull();
  });
});
