import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnsureSandboxActive,
  mockEnsurePodSandboxActive,
  mockEnsureSandboxEgressOnExec,
  mockGetSandboxImage,
  mockLoggerError,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerChild,
  mockForConversation,
  mockForPod,
  mockSetupSandboxMount,
  mockRefreshSandboxMount,
  mockPrepareSandboxEgressBeforeMount,
  mockStartTelemetry,
  mockSetupPodStateOnColdStart,
} = vi.hoisted(() => {
  const mockSetupSandboxMount = vi.fn();
  const mockRefreshSandboxMount = vi.fn();
  return {
    mockEnsureSandboxActive: vi.fn(),
    mockEnsurePodSandboxActive: vi.fn(),
    mockEnsureSandboxEgressOnExec: vi.fn(),
    mockGetSandboxImage: vi.fn(),
    mockLoggerError: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockLoggerChild: vi.fn(),
    mockForConversation: vi.fn(),
    mockForPod: vi.fn(),
    mockSetupSandboxMount,
    mockRefreshSandboxMount,
    mockPrepareSandboxEgressBeforeMount: vi.fn(),
    mockStartTelemetry: vi.fn(),
    mockSetupPodStateOnColdStart: vi.fn(),
  };
});

// Partial mock: pod_mounts.ts imports POD_STATE_REPLICA_MOUNT_POINT from the
// same module, so the real constants must be preserved.
vi.mock("@app/lib/api/sandbox/db", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/db")>();
  return {
    ...actual,
    setupPodStateOnColdStart: mockSetupPodStateOnColdStart,
  };
});

vi.mock("@app/lib/api/sandbox/egress", () => ({
  ensureSandboxEgressOnExec: mockEnsureSandboxEgressOnExec,
  prepareSandboxEgressBeforeMount: mockPrepareSandboxEgressBeforeMount,
}));

vi.mock("@app/lib/api/file_system/dust_file_system", () => ({
  DustFileSystem: {
    forConversation: mockForConversation,
    forPod: mockForPod,
  },
}));

vi.mock("@app/lib/api/sandbox/image", () => ({
  getSandboxImage: mockGetSandboxImage,
}));

vi.mock("@app/lib/api/sandbox/telemetry", () => ({
  startTelemetry: mockStartTelemetry,
}));

vi.mock(
  "@app/lib/resources/conversation_sandbox_adapter",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/resources/conversation_sandbox_adapter")
      >();
    return {
      ConversationSandboxAdapter: {
        ensureSandboxActive: mockEnsureSandboxActive,
        fetchSandbox: actual.ConversationSandboxAdapter.fetchSandbox.bind(
          actual.ConversationSandboxAdapter
        ),
      },
    };
  }
);

vi.mock("@app/lib/resources/pod_sandbox_adapter", () => ({
  PodSandboxAdapter: {
    ensureSandboxActive: mockEnsurePodSandboxActive,
  },
}));

vi.mock("@app/logger/logger", () => {
  const logger = {
    error: mockLoggerError,
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    child: mockLoggerChild,
  };
  mockLoggerChild.mockReturnValue(logger);
  return { default: logger };
});

import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import {
  ensureConversationSandboxReady,
  ensurePodSandboxReady,
} from "./lifecycle";

function createDeferred<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  if (!resolvePromise) {
    throw new Error("Deferred promise resolver was not initialized.");
  }

  return { promise, resolve: resolvePromise };
}

describe("ensureConversationSandboxReady", () => {
  let auth: Authenticator;
  let conversation: ConversationType;
  let conversationOwner: {
    kind: "conversation";
    conversationId: string;
    spaceId: string | null;
  };
  const pod = { sId: "space-id" };
  const podOwner = {
    kind: "pod",
    spaceId: pod.sId,
  };
  const image = { name: "dust-base" };
  let sandbox: SandboxResource;
  const mockFs = {
    setupSandboxMount: mockSetupSandboxMount,
    refreshSandboxMount: mockRefreshSandboxMount,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const testSetup = await createResourceTest({ role: "admin" });
    auth = testSetup.authenticator;
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [new Date()],
    });
    conversationOwner = {
      kind: "conversation",
      conversationId: conversation.sId,
      spaceId: null,
    };
    sandbox = await SandboxFactory.create(auth, conversation);

    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox,
        wokeFromSleep: false,
        scope: { spaceId: null },
      })
    );
    mockEnsurePodSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox,
        wokeFromSleep: false,
        scope: undefined,
      })
    );
    mockPrepareSandboxEgressBeforeMount.mockResolvedValue(new Ok(undefined));
    mockEnsureSandboxEgressOnExec.mockResolvedValue(new Ok(undefined));
    mockGetSandboxImage.mockReturnValue(new Ok(image));
    mockStartTelemetry.mockResolvedValue(new Ok(undefined));
    mockForConversation.mockResolvedValue(new Ok(mockFs));
    mockForPod.mockResolvedValue(new Ok(mockFs));
    mockSetupSandboxMount.mockResolvedValue(new Ok(undefined));
    mockRefreshSandboxMount.mockResolvedValue(new Ok(undefined));
    mockSetupPodStateOnColdStart.mockResolvedValue(new Ok(undefined));
  });

  it("preps egress, mounts files, and ensures egress on exec for freshly-created sandboxes", async () => {
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        scope: { spaceId: null },
      })
    );

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isOk()).toBe(true);
    expect(mockPrepareSandboxEgressBeforeMount).toHaveBeenCalledTimes(1);
    expect(mockPrepareSandboxEgressBeforeMount).toHaveBeenCalledWith(
      auth,
      sandbox,
      { runtimeOwner: conversationOwner, egressPolicyOwnerId: conversation.sId }
    );
    expect(mockStartTelemetry).toHaveBeenCalledWith(
      auth,
      sandbox,
      conversationOwner
    );
    expect(mockForConversation).toHaveBeenCalledWith(auth, conversation);
    expect(mockSetupSandboxMount).toHaveBeenCalledWith(sandbox, image);
    expect(mockRefreshSandboxMount).not.toHaveBeenCalled();
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledWith(auth, sandbox, {
      runtimeOwner: conversationOwner,
      egressPolicyOwnerId: conversation.sId,
      wokeFromSleep: false,
    });
    expect(sandbox.lastRuntimeRefreshAt).toEqual(expect.any(Date));

    expect(mockSetupSandboxMount.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnsureSandboxEgressOnExec.mock.invocationCallOrder[0]
    );
  });

  it("keeps conversation-scoped policy with the Pod as an inherited layer", async () => {
    // The adapter resolves the pod association under the lifecycle lock and
    // returns it as the scope; the ready path derives everything from it.
    // (That resolution is itself pinned in sandbox_resource.test.ts.)
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        scope: { spaceId: "pod-space-id" },
      })
    );

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isOk()).toBe(true);
    // The runtime owner stays the conversation and carries its pod. The
    // egress policy file stays conversation-scoped (on-the-fly approvals
    // land there) while the Pod's policy applies as the inherited layer.
    const podConversationOwner = {
      ...conversationOwner,
      spaceId: "pod-space-id",
    };
    expect(mockPrepareSandboxEgressBeforeMount).toHaveBeenCalledWith(
      auth,
      sandbox,
      {
        runtimeOwner: podConversationOwner,
        egressPolicyOwnerId: conversation.sId,
        egressPolicyPodId: "pod-space-id",
      }
    );
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledWith(auth, sandbox, {
      runtimeOwner: podConversationOwner,
      egressPolicyOwnerId: conversation.sId,
      egressPolicyPodId: "pod-space-id",
      wokeFromSleep: false,
    });
    expect(mockForConversation).toHaveBeenCalledWith(auth, {
      ...conversation,
      spaceId: "pod-space-id",
    });
  });

  it("derives scope from the lock-resolved value, never the caller's snapshot", async () => {
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        // The lock-resolved scope says standalone…
        scope: { spaceId: null },
      })
    );
    // …while the caller's stale snapshot still carries a pod.
    const staleSnapshot = { ...conversation, spaceId: "stale-pod-space-id" };

    const result = await ensureConversationSandboxReady(
      auth as never,
      staleSnapshot as never
    );

    expect(result.isOk()).toBe(true);
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledWith(auth, sandbox, {
      runtimeOwner: conversationOwner,
      egressPolicyOwnerId: conversation.sId,
      wokeFromSleep: false,
    });
    expect(
      mockEnsureSandboxEgressOnExec.mock.calls[0][2].egressPolicyPodId
    ).toBeUndefined();
    expect(mockForConversation).toHaveBeenCalledWith(auth, {
      ...conversation,
      spaceId: null,
    });
  });

  it("starts GCS mount before initial egress prep resolves", async () => {
    const prepStarted = createDeferred<void>();
    const prepResult = createDeferred<Result<void, Error>>();
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        scope: { spaceId: null },
      })
    );
    mockPrepareSandboxEgressBeforeMount.mockImplementation(() => {
      prepStarted.resolve(undefined);
      return prepResult.promise;
    });

    const resultPromise = ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    await prepStarted.promise;
    // Two ticks: one for forConversation mock resolution, one for setupSandboxMount call.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockSetupSandboxMount).toHaveBeenCalledTimes(1);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();

    prepResult.resolve(new Ok(undefined));
    const result = await resultPromise;

    expect(result.isOk()).toBe(true);
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledTimes(1);
  });

  it("only refreshes the token (no remount) when the sandbox woke from sleep", async () => {
    await sandbox.updateLastRuntimeRefreshAt(new Date());
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox,
        wokeFromSleep: true,
        scope: { spaceId: null },
      })
    );

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isOk()).toBe(true);
    expect(mockPrepareSandboxEgressBeforeMount).not.toHaveBeenCalled();
    expect(mockSetupSandboxMount).not.toHaveBeenCalled();
    expect(mockStartTelemetry).toHaveBeenCalledWith(
      auth,
      sandbox,
      conversationOwner
    );
    expect(mockForConversation).toHaveBeenCalledWith(auth, conversation);
    expect(mockRefreshSandboxMount).toHaveBeenCalledWith(sandbox, image);
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledWith(auth, sandbox, {
      runtimeOwner: conversationOwner,
      egressPolicyOwnerId: conversation.sId,
      wokeFromSleep: true,
    });
  });

  it("refreshes the GCS token for already-running sandboxes", async () => {
    const staleRefreshAt = new Date(Date.now() - 6 * 60 * 1000);
    await sandbox.updateLastRuntimeRefreshAt(staleRefreshAt);

    const result = await ensureConversationSandboxReady(auth, conversation);

    expect(result.isOk()).toBe(true);
    expect(mockPrepareSandboxEgressBeforeMount).not.toHaveBeenCalled();
    expect(mockSetupSandboxMount).not.toHaveBeenCalled();
    expect(mockStartTelemetry).not.toHaveBeenCalled();
    expect(mockForConversation).toHaveBeenCalledWith(auth, conversation);
    expect(mockRefreshSandboxMount).toHaveBeenCalledWith(sandbox, image);
    expect(mockRefreshSandboxMount.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnsureSandboxEgressOnExec.mock.invocationCallOrder[0]
    );
    expect(sandbox.lastRuntimeRefreshAt?.getTime()).toBeGreaterThan(
      staleRefreshAt.getTime()
    );
  });

  it("skips GCS and egress refreshes for recently-refreshed sandboxes", async () => {
    const recentRefreshAt = new Date(Date.now() - 4 * 60 * 1000);
    await sandbox.updateLastRuntimeRefreshAt(recentRefreshAt);

    const result = await ensureConversationSandboxReady(auth, conversation);

    expect(result.isOk()).toBe(true);
    expect(mockGetSandboxImage).not.toHaveBeenCalled();
    expect(mockForConversation).not.toHaveBeenCalled();
    expect(mockRefreshSandboxMount).not.toHaveBeenCalled();
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
    expect(sandbox.lastRuntimeRefreshAt).toEqual(recentRefreshAt);
  });

  it("uses pod owner plumbing and pod filesystem mounts for pod sandboxes", async () => {
    mockEnsurePodSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        scope: undefined,
      })
    );

    const result = await ensurePodSandboxReady(auth as never, pod as never);

    expect(result.isOk()).toBe(true);
    expect(mockEnsurePodSandboxActive).toHaveBeenCalledWith(auth, pod, {
      requireRunning: false,
    });
    expect(mockEnsureSandboxActive).not.toHaveBeenCalled();
    // The pod's published bundles are mounted read-only under a pod-scoped
    // path; the litestream replica prefix is mounted rw for the in-sandbox
    // daemon.
    expect(mockForPod).toHaveBeenCalledWith(auth, pod, {
      sandboxOnlyMounts: [
        {
          kind: "pod_sandbox_functions",
          id: pod.sId,
          sandboxMountPoint: `/sandbox-functions/pods/${pod.sId}`,
          readOnly: true,
        },
        {
          kind: "pod_state",
          id: pod.sId,
          sandboxMountPoint: "/pod-state/replica",
          readOnly: false,
        },
      ],
    });
    expect(mockForConversation).not.toHaveBeenCalled();
    expect(mockPrepareSandboxEgressBeforeMount).toHaveBeenCalledWith(
      auth,
      sandbox,
      { runtimeOwner: podOwner, egressPolicyOwnerId: pod.sId }
    );
    expect(mockStartTelemetry).toHaveBeenCalledWith(auth, sandbox, podOwner);
    expect(mockSetupSandboxMount).toHaveBeenCalledWith(sandbox, image);
    // Pod state bring-up runs after the mounts and before egress-on-exec.
    expect(mockSetupPodStateOnColdStart).toHaveBeenCalledWith(auth, sandbox);
    expect(mockSetupSandboxMount.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetupPodStateOnColdStart.mock.invocationCallOrder[0]
    );
    expect(
      mockSetupPodStateOnColdStart.mock.invocationCallOrder[0]
    ).toBeLessThan(mockEnsureSandboxEgressOnExec.mock.invocationCallOrder[0]);
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledWith(auth, sandbox, {
      runtimeOwner: podOwner,
      egressPolicyOwnerId: pod.sId,
      wokeFromSleep: false,
    });
  });

  it("does not run pod state bring-up for conversation sandboxes", async () => {
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        scope: { spaceId: null },
      })
    );

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isOk()).toBe(true);
    expect(mockSetupPodStateOnColdStart).not.toHaveBeenCalled();
  });

  it("requests a sandbox kill when pod state cold start fails", async () => {
    mockEnsurePodSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        scope: undefined,
      })
    );
    const podStateError = new Error("restore failed");
    mockSetupPodStateOnColdStart.mockResolvedValue(new Err(podStateError));

    const result = await ensurePodSandboxReady(auth as never, pod as never);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(podStateError);
    }
    expect(sandbox.killRequestedAt).toEqual(expect.any(Date));
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
  });

  it("short-circuits when the sandbox image lookup fails", async () => {
    const imageError = new Error("image unavailable");
    mockGetSandboxImage.mockReturnValue(new Err(imageError));

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockStartTelemetry).not.toHaveBeenCalled();
    expect(mockSetupSandboxMount).not.toHaveBeenCalled();
    expect(mockRefreshSandboxMount).not.toHaveBeenCalled();
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      { err: imageError },
      "Failed to get sandbox image for GCS mount"
    );
  });

  it("short-circuits when ensureActive fails", async () => {
    mockEnsureSandboxActive.mockResolvedValue(
      new Err(new Error("ensure failed"))
    );

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockPrepareSandboxEgressBeforeMount).not.toHaveBeenCalled();
    expect(mockGetSandboxImage).not.toHaveBeenCalled();
  });

  it("returns the initial egress prep error after also running the GCS mount", async () => {
    const setupError = new Error("setup failed");
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        scope: { spaceId: null },
      })
    );
    mockPrepareSandboxEgressBeforeMount.mockResolvedValue(new Err(setupError));

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(setupError);
    }
    expect(mockSetupSandboxMount).toHaveBeenCalledTimes(1);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
  });

  it("returns the initial egress prep error when both initial phases fail", async () => {
    const setupError = new Error("setup failed");
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        scope: { spaceId: null },
      })
    );
    mockPrepareSandboxEgressBeforeMount.mockResolvedValue(new Err(setupError));
    mockSetupSandboxMount.mockResolvedValue(new Err(new Error("mount failed")));

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(setupError);
    }
    expect(mockSetupSandboxMount).toHaveBeenCalledTimes(1);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
  });

  it("short-circuits when mounting conversation files fails", async () => {
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        scope: { spaceId: null },
      })
    );
    mockSetupSandboxMount.mockResolvedValue(new Err(new Error("mount failed")));

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
  });

  it("short-circuits when DustFileSystem.forConversation fails", async () => {
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
        scope: { spaceId: null },
      })
    );
    mockForConversation.mockResolvedValue(
      new Err(new Error("space not found"))
    );

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockSetupSandboxMount).not.toHaveBeenCalled();
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
  });

  it("short-circuits when refreshing the GCS token fails", async () => {
    mockRefreshSandboxMount.mockResolvedValue(
      new Err(new Error("refresh failed"))
    );

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
    expect(sandbox.lastRuntimeRefreshAt).toBeNull();
  });

  it("short-circuits when ensure-on-exec fails", async () => {
    mockEnsureSandboxEgressOnExec.mockResolvedValue(
      new Err(new Error("ensure-egress failed"))
    );

    const result = await ensureConversationSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledTimes(1);
    expect(sandbox.lastRuntimeRefreshAt).toBeNull();
  });
});
