import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { ensureSandboxStateHealthOnSleep } from "@app/lib/api/sandbox/db";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import { reapSandboxPhaseActivity } from "@app/temporal/sandbox_reaper/activities";
import { SLEEP_THRESHOLD_MS } from "@app/temporal/sandbox_reaper/config";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameV2ContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnsureSandboxStateHealthOnSleep,
  mockExecuteWithLock,
  mockGetSandboxImage,
  mockGetSandboxProvider,
  mockHeartbeat,
  mockProviderDestroy,
  mockProviderSleep,
} = vi.hoisted(() => ({
  mockEnsureSandboxStateHealthOnSleep: vi.fn(),
  mockExecuteWithLock: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockGetSandboxProvider: vi.fn(),
  mockHeartbeat: vi.fn(),
  mockProviderDestroy: vi.fn(),
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

// The pod pre-sleep health check execs into the sandbox, and the provider
// here is a stub. The reaper contract is only that the check gates the pod
// sleep.
vi.mock("@app/lib/api/sandbox/db", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/db")>();
  return {
    ...actual,
    ensurePodStateHealthOnSleep: mockEnsureSandboxStateHealthOnSleep,
    ensureSandboxStateHealthOnSleep: mockEnsureSandboxStateHealthOnSleep,
  };
});

vi.mock("@app/lib/lock", () => ({
  executeWithLock: mockExecuteWithLock,
}));

describe("reapSandboxPhaseActivity", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockExecuteWithLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    mockEnsureSandboxStateHealthOnSleep.mockImplementation(
      async (...args: Parameters<typeof ensureSandboxStateHealthOnSleep>) => {
        const refreshMountCredential = args[2]?.refreshMountCredential;
        if (!refreshMountCredential) {
          throw new Error("Expected a mount credential refresh callback.");
        }
        return refreshMountCredential();
      }
    );
    vi.spyOn(DustFileSystem.prototype, "refreshSandboxMount").mockResolvedValue(
      new Ok(undefined)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sleeps stale conversation and pod sandboxes", async () => {
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
    vi.advanceTimersByTime(SLEEP_THRESHOLD_MS + 1);

    const result = await reapSandboxPhaseActivity({
      cursor: null,
      phase: "running",
    });

    expect(result).toEqual({
      failedCount: 0,
      nextCursor: null,
      processedCount: 2,
      skippedCount: 0,
      succeededCount: 2,
    });
    expect(mockProviderSleep).toHaveBeenCalledWith("conversation-provider", {
      workspaceId: workspace.sId,
    });
    expect(mockProviderSleep).toHaveBeenCalledWith("pod-provider", {
      workspaceId: workspace.sId,
    });
    // Pod sleeps run the pre-sleep state health check; conversations don't.
    expect(mockEnsureSandboxStateHealthOnSleep).toHaveBeenCalledTimes(1);
    expect(DustFileSystem.prototype.refreshSandboxMount).toHaveBeenCalledTimes(
      1
    );
  });

  it("destroys a kill-requested sandbox in a restricted project", async () => {
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
      create: vi.fn().mockResolvedValue(new Ok({ providerId: "pod-provider" })),
      destroy: mockProviderDestroy.mockResolvedValue(new Ok(undefined)),
    });
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const podSandboxResult = await PodSandboxAdapter.ensureSandboxActive(
      authenticator,
      pod
    );
    if (podSandboxResult.isErr()) {
      throw podSandboxResult.error;
    }
    vi.advanceTimersByTime(SLEEP_THRESHOLD_MS + 1);
    await podSandboxResult.value.sandbox.requestKill();

    const runningResult = await reapSandboxPhaseActivity({
      cursor: null,
      phase: "running",
    });
    expect(runningResult.processedCount).toBe(0);

    const result = await reapSandboxPhaseActivity({
      cursor: null,
      phase: "kill_requested",
    });

    expect(result).toEqual({
      failedCount: 0,
      nextCursor: null,
      processedCount: 1,
      skippedCount: 0,
      succeededCount: 1,
    });
    expect(mockProviderDestroy).toHaveBeenCalledWith("pod-provider", {
      workspaceId: workspace.sId,
    });
    expect(DustFileSystem.prototype.refreshSandboxMount).toHaveBeenCalledTimes(
      1
    );
    const sandbox = await PodSandboxAdapter.fetchSandbox(authenticator, pod);
    expect(sandbox?.status).toBe("deleted");
  });

  it("sleeps a stale Frame sandbox", async () => {
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
        .mockResolvedValue(new Ok({ providerId: "frame-provider" })),
      sleep: mockProviderSleep.mockResolvedValue(new Ok(undefined)),
    });
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const frame = await FileFactory.create(authenticator, null, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 1,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });
    const sandboxResult = await FrameSandboxAdapter.ensureSandboxActive(
      authenticator,
      frame
    );
    if (sandboxResult.isErr()) {
      throw sandboxResult.error;
    }
    vi.advanceTimersByTime(SLEEP_THRESHOLD_MS + 1);

    const result = await reapSandboxPhaseActivity({
      cursor: null,
      phase: "running",
    });

    expect(result).toEqual({
      failedCount: 0,
      nextCursor: null,
      processedCount: 1,
      skippedCount: 0,
      succeededCount: 1,
    });
    expect(mockProviderSleep).toHaveBeenCalledWith("frame-provider", {
      workspaceId: workspace.sId,
    });
    expect(mockEnsureSandboxStateHealthOnSleep).toHaveBeenCalledTimes(1);
    expect(DustFileSystem.prototype.refreshSandboxMount).toHaveBeenCalledTimes(
      1
    );
  });

  it("skips kill-requested sleeping sandboxes in the awake kill phase", async () => {
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
      create: vi.fn().mockResolvedValue(new Ok({ providerId: "pod-provider" })),
      destroy: mockProviderDestroy.mockResolvedValue(new Ok(undefined)),
    });
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const podSandboxResult = await PodSandboxAdapter.ensureSandboxActive(
      authenticator,
      pod
    );
    if (podSandboxResult.isErr()) {
      throw podSandboxResult.error;
    }
    await podSandboxResult.value.sandbox.updateStatus("sleeping");
    await podSandboxResult.value.sandbox.requestKill();

    const awakeResult = await reapSandboxPhaseActivity({
      cursor: null,
      phase: "kill_requested",
    });
    expect(awakeResult.processedCount).toBe(0);
    expect(mockProviderDestroy).not.toHaveBeenCalled();

    const result = await reapSandboxPhaseActivity({
      cursor: null,
      phase: "kill_requested_sleeping",
    });

    expect(result).toEqual({
      failedCount: 0,
      nextCursor: null,
      processedCount: 1,
      skippedCount: 0,
      succeededCount: 1,
    });
    expect(mockProviderDestroy).toHaveBeenCalledWith("pod-provider", {
      workspaceId: workspace.sId,
    });
    const sandbox = await PodSandboxAdapter.fetchSandbox(authenticator, pod);
    expect(sandbox?.status).toBe("deleted");
  });
});
