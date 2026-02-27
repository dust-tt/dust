import {
  generateSandboxExecToken,
  SANDBOX_TOKEN_PREFIX,
  verifySandboxExecToken,
} from "@app/lib/api/sandbox/access_tokens";
import { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
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

  return { auth, conversation, sandbox };
}

describe("sandbox access tokens", () => {
  it("round-trip: generate → verify → check claims", async () => {
    const { auth, conversation, sandbox } = await setupTest();

    const token = generateSandboxExecToken(auth, { conversation, sandbox });

    expect(token.startsWith(SANDBOX_TOKEN_PREFIX)).toBe(true);

    const payload = verifySandboxExecToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.wId).toBe(auth.getNonNullableWorkspace().sId);
    expect(payload!.cId).toBe(conversation.sId);
    expect(payload!.uId).toBe(auth.getNonNullableUser().sId);
    expect(payload!.sbId).toBe(sandbox.sId);
  });

  it("tampered token is rejected", async () => {
    const { auth, conversation, sandbox } = await setupTest();

    const token = generateSandboxExecToken(auth, { conversation, sandbox });

    // Decode, modify, re-sign with a wrong secret.
    const jwtPart = token.slice(SANDBOX_TOKEN_PREFIX.length);
    const decoded = jwt.decode(jwtPart) as Record<string, unknown>;
    const tampered =
      SANDBOX_TOKEN_PREFIX +
      jwt.sign({ ...decoded, wId: "hacked" }, "wrong-secret", {
        algorithm: "HS256",
      });

    const payload = verifySandboxExecToken(tampered);
    expect(payload).toBeNull();
  });

  it("token without sbt- prefix is rejected", async () => {
    const { auth, conversation, sandbox } = await setupTest();

    const token = generateSandboxExecToken(auth, { conversation, sandbox });
    const raw = token.slice(SANDBOX_TOKEN_PREFIX.length);

    expect(verifySandboxExecToken(raw)).toBeNull();
  });
});
