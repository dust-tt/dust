import {
  generateSandboxExecToken,
  generateSandboxFunctionInvocationToken,
  generateSandboxPollerToken,
  isSandboxExecTokenPayload,
  isSandboxFunctionInvocationTokenPayload,
  isSandboxPollerTokenPayload,
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
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
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

  return {
    auth,
    agentConfig,
    agentMessage,
    conversation,
    mockAction,
    sandbox,
    user,
    workspace,
  };
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
    if (!payload || !isSandboxExecTokenPayload(payload)) {
      return;
    }
    expect(payload!.wId).toBe(auth.getNonNullableWorkspace().sId);
    expect(payload!.cId).toBe(conversation.sId);
    expect(payload!.uId).toBe(auth.getNonNullableUser().sId);
    expect(payload!.aId).toBe(agentConfig.sId);
    expect(payload!.aV).toBe(agentConfig.version);
    expect(payload!.mId).toBe(agentMessage.sId);
    expect(payload!.sbId).toBe(sandbox.sId);
  });

  it("recovers the pinned agent version for legacy exec tokens", async () => {
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
      execId: "legacy-exec-id",
      sandboxAction: mockAction,
    });
    const decoded = jwt.decode(
      token.slice(SANDBOX_TOKEN_PREFIX.length)
    ) as Record<string, unknown>;
    const { aV: _agentVersion, ...legacyClaims } = decoded;
    const legacyToken =
      SANDBOX_TOKEN_PREFIX +
      jwt.sign(legacyClaims, TEST_SECRET, { algorithm: "HS256" });

    const payload = await verifySandboxExecToken(legacyToken);

    expect(payload).not.toBeNull();
    expect(isSandboxExecTokenPayload(payload!)).toBe(true);
    expect(payload?.aV).toBe(agentConfig.version);
  });

  it("rejects an exec token referencing a missing agent version", async () => {
    const {
      auth,
      agentConfig,
      agentMessage,
      conversation,
      sandbox,
      mockAction,
      workspace,
    } = await setupTest();

    const token = await generateSandboxExecToken(auth, {
      agentConfiguration: agentConfig,
      agentMessage,
      conversation,
      sandbox,
      execId: "missing-version-exec-id",
      sandboxAction: mockAction,
    });
    const payload = await verifySandboxExecToken(token);
    if (!payload || !isSandboxExecTokenPayload(payload)) {
      throw new Error("Expected a valid sandbox exec token.");
    }

    const authResult = await Authenticator.fromSandboxToken(
      { ...payload, aV: agentConfig.version + 1_000 },
      workspace.sId
    );

    expect(authResult.isErr()).toBe(true);
    if (authResult.isErr()) {
      expect(authResult.error.api_error.type).toBe(
        "invalid_sandbox_token_error"
      );
    }
  });

  it("round-trip: generate function invocation token → verify → check claims", async () => {
    const { auth, sandbox } = await setupTest();
    const pod = await SpaceFactory.project(auth.getNonNullableWorkspace());

    const token = await generateSandboxFunctionInvocationToken(auth, {
      noTools: false,
      sandbox,
      sandboxFunction: {
        sId: "sfn_test",
        space: { sId: pod.sId },
      },
      conversationId: "conv_test",
      invocationId: "test-invocation-id",
      execId: "test-exec-id",
    });

    expect(token.startsWith(SANDBOX_TOKEN_PREFIX)).toBe(true);

    const payload = await verifySandboxExecToken(token);

    expect(payload).not.toBeNull();
    if (!payload || !isSandboxFunctionInvocationTokenPayload(payload)) {
      return;
    }
    expect(payload.wId).toBe(auth.getNonNullableWorkspace().sId);
    expect(payload.cId).toBe("conv_test");
    expect(payload.uId).toBe(auth.getNonNullableUser().sId);
    expect(payload.sbId).toBe(sandbox.sId);
    expect(payload.execId).toBe("test-exec-id");
    expect(payload.spaceId).toBe(pod.sId);
    expect(payload.sandboxFunctionId).toBe("sfn_test");
    expect(payload.invocationId).toBe("test-invocation-id");
  });

  it("round-trip: generate poller token → verify → check claims", async () => {
    const { auth, sandbox } = await setupTest();

    const token = await generateSandboxPollerToken(auth, { sandbox });

    expect(token.startsWith(SANDBOX_TOKEN_PREFIX)).toBe(true);

    const payload = await verifySandboxExecToken(token);

    expect(payload).not.toBeNull();
    if (!payload || !isSandboxPollerTokenPayload(payload)) {
      throw new Error("Expected a poller token payload.");
    }
    expect(payload.wId).toBe(auth.getNonNullableWorkspace().sId);
    expect(payload.sbId).toBe(sandbox.sId);
    expect(payload.providerId).toBe(sandbox.providerId);
  });

  it("a poller token is not an action or invocation token", async () => {
    const { auth, sandbox } = await setupTest();

    const payload = await verifySandboxExecToken(
      await generateSandboxPollerToken(auth, { sandbox })
    );

    expect(payload).not.toBeNull();
    if (!payload) {
      throw new Error("Expected a poller token payload.");
    }
    // What keeps the poller's routes out of reach of a workload token, and the workload's routes
    // out of reach of the poller's, is that no token satisfies two of these at once.
    expect(isSandboxPollerTokenPayload(payload)).toBe(true);
    expect(isSandboxExecTokenPayload(payload)).toBe(false);
    expect(isSandboxFunctionInvocationTokenPayload(payload)).toBe(false);
  });

  it("an invocation token is not a poller token", async () => {
    const { auth, sandbox } = await setupTest();
    const pod = await SpaceFactory.project(auth.getNonNullableWorkspace());

    const payload = await verifySandboxExecToken(
      await generateSandboxFunctionInvocationToken(auth, {
        noTools: false,
        sandbox,
        sandboxFunction: { sId: "sfn_test", space: { sId: pod.sId } },
        invocationId: "test-invocation-id",
        execId: "test-exec-id",
      })
    );

    expect(payload).not.toBeNull();
    if (!payload) {
      throw new Error("Expected an invocation token payload.");
    }
    expect(isSandboxPollerTokenPayload(payload)).toBe(false);
  });

  it("rejects a token that claims to be both a poller and an invocation", async () => {
    const { auth, sandbox } = await setupTest();
    const pod = await SpaceFactory.project(auth.getNonNullableWorkspace());

    // A forged payload: signed with the real secret, but mixing the poller's claims into a
    // workload token to reach the poller's routes.
    const forged = jwt.sign(
      {
        wId: auth.getNonNullableWorkspace().sId,
        sbId: sandbox.sId,
        execId: "test-exec-id",
        spaceId: pod.sId,
        sandboxFunctionId: "sfn_test",
        invocationId: "test-invocation-id",
        purpose: "sandbox_function_poller",
        providerId: sandbox.providerId,
      },
      TEST_SECRET,
      { algorithm: "HS256", expiresIn: 120 }
    );

    expect(
      await verifySandboxExecToken(`${SANDBOX_TOKEN_PREFIX}${forged}`)
    ).toBeNull();
  });

  it("rejects a poller token naming a user", async () => {
    const { auth, sandbox } = await setupTest();

    // The authenticator resolves `uId` and adopts that user's role, so a poller token naming an
    // admin would authenticate as one. The poller is a pod process and must not speak for a
    // person.
    const forged = jwt.sign(
      {
        wId: auth.getNonNullableWorkspace().sId,
        sbId: sandbox.sId,
        execId: "test-exec-id",
        purpose: "sandbox_function_poller",
        providerId: sandbox.providerId,
        uId: auth.getNonNullableUser().sId,
      },
      TEST_SECRET,
      { algorithm: "HS256", expiresIn: 120 }
    );

    expect(
      await verifySandboxExecToken(`${SANDBOX_TOKEN_PREFIX}${forged}`)
    ).toBeNull();
  });

  it("rejects a poller token that grants itself tools", async () => {
    const { auth, sandbox } = await setupTest();

    const forged = jwt.sign(
      {
        wId: auth.getNonNullableWorkspace().sId,
        sbId: sandbox.sId,
        execId: "test-exec-id",
        purpose: "sandbox_function_poller",
        providerId: sandbox.providerId,
        cId: "conv_test",
      },
      TEST_SECRET,
      { algorithm: "HS256", expiresIn: 120 }
    );

    expect(
      await verifySandboxExecToken(`${SANDBOX_TOKEN_PREFIX}${forged}`)
    ).toBeNull();
  });

  it("revokes the superseded token when rotating", async () => {
    const { auth, sandbox } = await setupTest();

    const first = await generateSandboxPollerToken(auth, { sandbox });
    const firstPayload = await verifySandboxExecToken(first);
    expect(firstPayload).not.toBeNull();
    if (!firstPayload) {
      throw new Error("Expected a poller token payload.");
    }

    const second = await generateSandboxPollerToken(auth, {
      sandbox,
      supersedes: firstPayload,
    });

    expect(await verifySandboxExecToken(second)).not.toBeNull();
    expect(await verifySandboxExecToken(first)).toBeNull();
  });

  it("rejects a poller token that omits its sandbox binding", async () => {
    const { auth, sandbox } = await setupTest();

    const forged = jwt.sign(
      {
        wId: auth.getNonNullableWorkspace().sId,
        sbId: sandbox.sId,
        execId: "test-exec-id",
        purpose: "sandbox_function_poller",
      },
      TEST_SECRET,
      { algorithm: "HS256", expiresIn: 120 }
    );

    expect(
      await verifySandboxExecToken(`${SANDBOX_TOKEN_PREFIX}${forged}`)
    ).toBeNull();
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
