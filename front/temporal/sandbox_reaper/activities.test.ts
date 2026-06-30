import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import { SandboxModel } from "@app/lib/resources/storage/models/sandbox";
import { reapStaleSandboxesActivity } from "@app/temporal/sandbox_reaper/activities";
import { SLEEP_THRESHOLD_MS } from "@app/temporal/sandbox_reaper/config";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

const {
  mockExecuteWithLock,
  mockGetSandboxImage,
  mockGetSandboxProvider,
  mockHeartbeat,
  mockProviderSleep,
} = vi.hoisted(() => ({
  mockExecuteWithLock: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockGetSandboxProvider: vi.fn(),
  mockHeartbeat: vi.fn(),
  mockProviderSleep: vi.fn(),
}));

vi.mock("@temporalio/activity", () => ({
  heartbeat: mockHeartbeat,
}));

vi.mock("@app/lib/api/sandbox", () => ({
  getSandboxProvider: mockGetSandboxProvider,
}));

vi.mock("@app/lib/api/sandbox/image", () => ({
  getSandboxImage: mockGetSandboxImage,
}));

vi.mock("@app/lib/lock", () => ({
  executeWithLock: mockExecuteWithLock,
}));

describe("reapStaleSandboxesActivity", () => {
  it("sleeps stale conversation and pod sandboxes", async () => {
    mockExecuteWithLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    mockGetSandboxImage.mockReturnValue(
      new Ok({
        toCreateConfig: () => ({
          imageId: { imageName: "test-image", tag: "0.0.1" },
          envVars: {},
          network: { egress: "restricted" },
          resources: { cpu: 1, memoryMB: 512 },
        }),
      })
    );
    mockGetSandboxProvider.mockReturnValue({
      create: vi
        .fn()
        .mockResolvedValueOnce(new Ok({ providerId: "conversation-provider" }))
        .mockResolvedValueOnce(new Ok({ providerId: "pod-provider" })),
      sleep: mockProviderSleep.mockResolvedValue(new Ok(undefined)),
    });
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
    const pod = await SpaceFactory.project(workspace);
    const conversationSandboxResult =
      await ConversationSandboxAdapter.ensureSandboxActive(
        authenticator,
        conversation
      );
    const podSandboxResult = await PodSandboxAdapter.ensureSandboxActive(
      authenticator,
      pod
    );
    if (conversationSandboxResult.isErr()) {
      throw conversationSandboxResult.error;
    }
    if (podSandboxResult.isErr()) {
      throw podSandboxResult.error;
    }
    const staleLastActivityAt = new Date(Date.now() - SLEEP_THRESHOLD_MS - 1);
    await SandboxModel.update(
      { lastActivityAt: staleLastActivityAt },
      {
        where: {
          id: [
            conversationSandboxResult.value.sandbox.id,
            podSandboxResult.value.sandbox.id,
          ],
        },
      }
    );

    const hasMore = await reapStaleSandboxesActivity();

    expect(hasMore).toBe(false);
    expect(mockProviderSleep).toHaveBeenCalledWith("conversation-provider", {
      workspaceId: workspace.sId,
    });
    expect(mockProviderSleep).toHaveBeenCalledWith("pod-provider", {
      workspaceId: workspace.sId,
    });
  });
});
