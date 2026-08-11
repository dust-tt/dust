import { Authenticator } from "@app/lib/auth";
import { SandboxFileSystemMutationResource } from "@app/lib/resources/sandbox_file_system_mutation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";

async function setup() {
  const user = await UserFactory.basic();
  const workspace = await WorkspaceFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  await SpaceFactory.defaults(auth);
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });
  const sandbox = await SandboxFactory.create(auth, conversation);

  return { auth, sandbox };
}

describe("SandboxFileSystemMutationResource", () => {
  it("claims once and replays a completed mutation without executing it", async () => {
    const { auth, sandbox } = await setup();
    const idempotencyKey = randomUUID();
    const request = {
      operation: "unlink",
      mount: { kind: "conversation", id: "conversation-id" },
      path: "frame.tsx",
      idempotencyKey,
    };

    const first = await SandboxFileSystemMutationResource.claim(auth, sandbox, {
      idempotencyKey,
      request,
    });
    expect(first.isOk()).toBe(true);
    if (first.isErr()) {
      throw first.error;
    }
    expect(first.value.shouldExecute).toBe(true);

    const concurrent = await SandboxFileSystemMutationResource.claim(
      auth,
      sandbox,
      { idempotencyKey, request }
    );
    expect(concurrent.isOk()).toBe(true);
    if (concurrent.isErr()) {
      throw concurrent.error;
    }
    expect(concurrent.value.shouldExecute).toBe(false);
    expect(concurrent.value.mutation.status).toBe("pending");

    await first.value.mutation.markCompleted(auth);
    const replay = await SandboxFileSystemMutationResource.claim(
      auth,
      sandbox,
      { idempotencyKey, request }
    );
    expect(replay.isOk()).toBe(true);
    if (replay.isErr()) {
      throw replay.error;
    }
    expect(replay.value.shouldExecute).toBe(false);
    expect(replay.value.mutation.status).toBe("completed");
  });

  it("rejects reuse of an idempotency key for another request", async () => {
    const { auth, sandbox } = await setup();
    const idempotencyKey = randomUUID();
    const request = {
      operation: "unlink",
      mount: { kind: "conversation", id: "conversation-id" },
      path: "frame.tsx",
      idempotencyKey,
    };

    const first = await SandboxFileSystemMutationResource.claim(auth, sandbox, {
      idempotencyKey,
      request,
    });
    expect(first.isOk()).toBe(true);

    const reused = await SandboxFileSystemMutationResource.claim(
      auth,
      sandbox,
      {
        idempotencyKey,
        request: { ...request, path: "other.tsx" },
      }
    );
    expect(reused.isErr()).toBe(true);
    if (reused.isOk()) {
      throw new Error("Expected idempotency key reuse to be rejected.");
    }
    expect(reused.error.message).toContain("another mutation");
  });
});
