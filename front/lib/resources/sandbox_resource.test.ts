import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDistribution = vi.fn();
vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({
    increment: vi.fn(),
    distribution: mockDistribution,
  }),
}));

import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import type { ConversationType } from "@app/types/assistant/conversation";

describe("SandboxResource.updateStatus", () => {
  let authenticator: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    mockDistribution.mockClear();

    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
  });

  it("records state duration when statusChangedAt exists", async () => {
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      statusChangedAt: new Date(Date.now() - 60_000),
    });

    const ctx = { workspaceId: authenticator.getNonNullableWorkspace().sId };
    await sandbox.updateStatus("sleeping", { ctx });

    expect(mockDistribution).toHaveBeenCalledWith(
      "sandbox.lifecycle.duration",
      expect.any(Number),
      expect.arrayContaining([
        `workspace_id:${ctx.workspaceId}`,
        "status:running",
      ])
    );

    const durationArg = mockDistribution.mock.calls[0][1];
    expect(durationArg).toBeGreaterThanOrEqual(60_000);
    expect(durationArg).toBeLessThan(65_000);
  });

  it("skips duration recording when statusChangedAt is null", async () => {
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      statusChangedAt: null,
    });

    const ctx = { workspaceId: authenticator.getNonNullableWorkspace().sId };
    await sandbox.updateStatus("sleeping", { ctx });

    expect(mockDistribution).not.toHaveBeenCalled();
  });

  it("does nothing when transitioning to same status", async () => {
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      statusChangedAt: new Date(),
    });

    const originalStatusChangedAt = sandbox.statusChangedAt;
    const ctx = { workspaceId: authenticator.getNonNullableWorkspace().sId };
    await sandbox.updateStatus("running", { ctx });

    expect(mockDistribution).not.toHaveBeenCalled();

    const reloaded = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
    );
    expect(reloaded?.statusChangedAt?.getTime()).toBe(
      originalStatusChangedAt?.getTime()
    );
  });

  it("updates status and statusChangedAt", async () => {
    const originalTime = new Date(Date.now() - 60_000);
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      statusChangedAt: originalTime,
    });

    const ctx = { workspaceId: authenticator.getNonNullableWorkspace().sId };
    const beforeTransition = Date.now();
    await sandbox.updateStatus("sleeping", { ctx });
    const afterTransition = Date.now();

    const reloaded = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
    );
    expect(reloaded?.status).toBe("sleeping");
    expect(reloaded?.statusChangedAt?.getTime()).toBeGreaterThanOrEqual(
      beforeTransition
    );
    expect(reloaded?.statusChangedAt?.getTime()).toBeLessThanOrEqual(
      afterTransition
    );
  });
});
