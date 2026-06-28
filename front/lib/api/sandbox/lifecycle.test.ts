import { Err, Ok, type Result } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnsureSandboxActive,
  mockEnsureSandboxEgressOnExec,
  mockGetSandboxImage,
  mockLoggerError,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerChild,
  mockForConversation,
  mockSetupSandboxMount,
  mockRefreshSandboxMount,
  mockPrepareSandboxEgressBeforeMount,
  mockStartTelemetry,
} = vi.hoisted(() => {
  const mockSetupSandboxMount = vi.fn();
  const mockRefreshSandboxMount = vi.fn();
  return {
    mockEnsureSandboxActive: vi.fn(),
    mockEnsureSandboxEgressOnExec: vi.fn(),
    mockGetSandboxImage: vi.fn(),
    mockLoggerError: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockLoggerChild: vi.fn(),
    mockForConversation: vi.fn(),
    mockSetupSandboxMount,
    mockRefreshSandboxMount,
    mockPrepareSandboxEgressBeforeMount: vi.fn(),
    mockStartTelemetry: vi.fn(),
  };
});

vi.mock("@app/lib/api/sandbox/egress", () => ({
  ensureSandboxEgressOnExec: mockEnsureSandboxEgressOnExec,
  prepareSandboxEgressBeforeMount: mockPrepareSandboxEgressBeforeMount,
}));

vi.mock("@app/lib/api/file_system/dust_file_system", () => ({
  DustFileSystem: {
    forConversation: mockForConversation,
  },
}));

vi.mock("@app/lib/api/sandbox/image", () => ({
  getSandboxImage: mockGetSandboxImage,
}));

vi.mock("@app/lib/api/sandbox/telemetry", () => ({
  startTelemetry: mockStartTelemetry,
}));

vi.mock("@app/lib/resources/conversation_sandbox_adapter", () => ({
  ConversationSandboxAdapter: {
    ensureSandboxActive: mockEnsureSandboxActive,
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

import { ensureSandboxReady } from "./lifecycle";

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

describe("ensureSandboxReady", () => {
  const auth = { getNonNullableWorkspace: () => ({ sId: "workspace-id" }) };
  const conversation = { sId: "conversation-id" };
  const image = { name: "dust-base" };
  const sandbox = { providerId: "provider-id", sId: "sandbox-id" };
  const mockFs = {
    setupSandboxMount: mockSetupSandboxMount,
    refreshSandboxMount: mockRefreshSandboxMount,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({ freshlyCreated: false, sandbox, wokeFromSleep: false })
    );
    mockPrepareSandboxEgressBeforeMount.mockResolvedValue(new Ok(undefined));
    mockEnsureSandboxEgressOnExec.mockResolvedValue(new Ok(undefined));
    mockGetSandboxImage.mockReturnValue(new Ok(image));
    mockStartTelemetry.mockResolvedValue(new Ok(undefined));
    mockForConversation.mockResolvedValue(new Ok(mockFs));
    mockSetupSandboxMount.mockResolvedValue(new Ok(undefined));
    mockRefreshSandboxMount.mockResolvedValue(new Ok(undefined));
  });

  it("preps egress, mounts files, and ensures egress on exec for freshly-created sandboxes", async () => {
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({ freshlyCreated: true, sandbox, wokeFromSleep: false })
    );

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isOk()).toBe(true);
    expect(mockPrepareSandboxEgressBeforeMount).toHaveBeenCalledTimes(1);
    expect(mockPrepareSandboxEgressBeforeMount).toHaveBeenCalledWith(
      auth,
      sandbox
    );
    expect(mockForConversation).toHaveBeenCalledWith(auth, conversation);
    expect(mockSetupSandboxMount).toHaveBeenCalledWith(sandbox, image);
    expect(mockRefreshSandboxMount).not.toHaveBeenCalled();
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledWith(auth, sandbox, {
      wokeFromSleep: false,
    });

    expect(mockSetupSandboxMount.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnsureSandboxEgressOnExec.mock.invocationCallOrder[0]
    );
  });

  it("starts GCS mount before initial egress prep resolves", async () => {
    const prepStarted = createDeferred<void>();
    const prepResult = createDeferred<Result<void, Error>>();
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({ freshlyCreated: true, sandbox, wokeFromSleep: false })
    );
    mockPrepareSandboxEgressBeforeMount.mockImplementation(() => {
      prepStarted.resolve(undefined);
      return prepResult.promise;
    });

    const resultPromise = ensureSandboxReady(
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
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({ freshlyCreated: false, sandbox, wokeFromSleep: true })
    );

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isOk()).toBe(true);
    expect(mockPrepareSandboxEgressBeforeMount).not.toHaveBeenCalled();
    expect(mockSetupSandboxMount).not.toHaveBeenCalled();
    expect(mockForConversation).toHaveBeenCalledWith(auth, conversation);
    expect(mockRefreshSandboxMount).toHaveBeenCalledWith(sandbox, image);
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledWith(auth, sandbox, {
      wokeFromSleep: true,
    });
  });

  it("refreshes the GCS token for already-running sandboxes", async () => {
    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isOk()).toBe(true);
    expect(mockPrepareSandboxEgressBeforeMount).not.toHaveBeenCalled();
    expect(mockSetupSandboxMount).not.toHaveBeenCalled();
    expect(mockForConversation).toHaveBeenCalledWith(auth, conversation);
    expect(mockRefreshSandboxMount).toHaveBeenCalledWith(sandbox, image);
    expect(mockRefreshSandboxMount.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnsureSandboxEgressOnExec.mock.invocationCallOrder[0]
    );
  });

  it("short-circuits when the sandbox image lookup fails", async () => {
    const imageError = new Error("image unavailable");
    mockGetSandboxImage.mockReturnValue(new Err(imageError));

    const result = await ensureSandboxReady(
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

    const result = await ensureSandboxReady(
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
      new Ok({ freshlyCreated: true, sandbox, wokeFromSleep: false })
    );
    mockPrepareSandboxEgressBeforeMount.mockResolvedValue(new Err(setupError));

    const result = await ensureSandboxReady(
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
      new Ok({ freshlyCreated: true, sandbox, wokeFromSleep: false })
    );
    mockPrepareSandboxEgressBeforeMount.mockResolvedValue(new Err(setupError));
    mockSetupSandboxMount.mockResolvedValue(new Err(new Error("mount failed")));

    const result = await ensureSandboxReady(
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
      new Ok({ freshlyCreated: true, sandbox, wokeFromSleep: false })
    );
    mockSetupSandboxMount.mockResolvedValue(new Err(new Error("mount failed")));

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
  });

  it("short-circuits when DustFileSystem.forConversation fails", async () => {
    mockEnsureSandboxActive.mockResolvedValue(
      new Ok({ freshlyCreated: true, sandbox, wokeFromSleep: false })
    );
    mockForConversation.mockResolvedValue(
      new Err(new Error("space not found"))
    );

    const result = await ensureSandboxReady(
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

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
  });

  it("short-circuits when ensure-on-exec fails", async () => {
    mockEnsureSandboxEgressOnExec.mockResolvedValue(
      new Err(new Error("ensure-egress failed"))
    );

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledTimes(1);
  });
});
