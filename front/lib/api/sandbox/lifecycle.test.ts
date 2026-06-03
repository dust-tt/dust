import { Err, Ok, type Result } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnsureActive,
  mockEnsureSandboxEgressOnExec,
  mockGetSandboxImage,
  mockLoggerError,
  mockLoggerInfo,
  mockLoggerWarn,
  mockMountConversationFiles,
  mockPrepareSandboxEgressBeforeMount,
  mockRefreshGcsToken,
  mockStartTelemetry,
} = vi.hoisted(() => ({
  mockEnsureActive: vi.fn(),
  mockEnsureSandboxEgressOnExec: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockMountConversationFiles: vi.fn(),
  mockPrepareSandboxEgressBeforeMount: vi.fn(),
  mockRefreshGcsToken: vi.fn(),
  mockStartTelemetry: vi.fn(),
}));

vi.mock("@app/lib/api/sandbox/egress", () => ({
  ensureSandboxEgressOnExec: mockEnsureSandboxEgressOnExec,
  prepareSandboxEgressBeforeMount: mockPrepareSandboxEgressBeforeMount,
}));

vi.mock("@app/lib/api/sandbox/gcs/mount", () => ({
  mountConversationFiles: mockMountConversationFiles,
  refreshGcsToken: mockRefreshGcsToken,
}));

vi.mock("@app/lib/api/sandbox/image", () => ({
  getSandboxImage: mockGetSandboxImage,
}));

vi.mock("@app/lib/api/sandbox/telemetry", () => ({
  startTelemetry: mockStartTelemetry,
}));

vi.mock("@app/lib/resources/sandbox_resource", () => ({
  SandboxResource: {
    ensureActive: mockEnsureActive,
  },
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    error: mockLoggerError,
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
  },
}));

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
  const sandbox = {
    providerId: "provider-id",
    sId: "sandbox-id",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox,
        wokeFromSleep: false,
      })
    );
    mockPrepareSandboxEgressBeforeMount.mockResolvedValue(new Ok(undefined));
    mockEnsureSandboxEgressOnExec.mockResolvedValue(new Ok(undefined));
    mockGetSandboxImage.mockReturnValue(new Ok(image));
    mockStartTelemetry.mockResolvedValue(new Ok(undefined));
    mockMountConversationFiles.mockResolvedValue(new Ok(undefined));
    mockRefreshGcsToken.mockResolvedValue(new Ok(undefined));
  });

  it("preps egress, mounts files, and ensures egress on exec for freshly-created sandboxes", async () => {
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
      })
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
    expect(mockMountConversationFiles).toHaveBeenCalledWith(
      auth,
      sandbox,
      conversation,
      image
    );
    expect(mockRefreshGcsToken).not.toHaveBeenCalled();
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledWith(auth, sandbox, {
      wokeFromSleep: false,
    });

    expect(mockMountConversationFiles.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnsureSandboxEgressOnExec.mock.invocationCallOrder[0]
    );
  });

  it("starts GCS mount before initial egress prep resolves", async () => {
    const prepStarted = createDeferred<void>();
    const prepResult = createDeferred<Result<void, Error>>();
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
      })
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
    await Promise.resolve();

    expect(mockMountConversationFiles).toHaveBeenCalledTimes(1);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();

    prepResult.resolve(new Ok(undefined));
    const result = await resultPromise;

    expect(result.isOk()).toBe(true);
    expect(mockEnsureSandboxEgressOnExec).toHaveBeenCalledTimes(1);
  });

  it("only refreshes the token (no remount) when the sandbox woke from sleep", async () => {
    // e2b preserves the FUSE mount and the token server across betaPause +
    // connect, so on wake we must NOT remount, that would fail with EBUSY.
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox,
        wokeFromSleep: true,
      })
    );

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isOk()).toBe(true);
    expect(mockPrepareSandboxEgressBeforeMount).not.toHaveBeenCalled();
    expect(mockMountConversationFiles).not.toHaveBeenCalled();
    expect(mockRefreshGcsToken).toHaveBeenCalledWith(
      auth,
      sandbox,
      conversation,
      image
    );
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
    expect(mockMountConversationFiles).not.toHaveBeenCalled();
    expect(mockRefreshGcsToken).toHaveBeenCalledWith(
      auth,
      sandbox,
      conversation,
      image
    );
    expect(mockRefreshGcsToken.mock.invocationCallOrder[0]).toBeLessThan(
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
    expect(mockMountConversationFiles).not.toHaveBeenCalled();
    expect(mockRefreshGcsToken).not.toHaveBeenCalled();
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      { err: imageError },
      "Failed to get sandbox image for GCS mount"
    );
  });

  it("short-circuits when ensureActive fails", async () => {
    mockEnsureActive.mockResolvedValue(new Err(new Error("ensure failed")));

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
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
      })
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
    expect(mockMountConversationFiles).toHaveBeenCalledTimes(1);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
  });

  it("returns the initial egress prep error when both initial phases fail", async () => {
    const setupError = new Error("setup failed");
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
      })
    );
    mockPrepareSandboxEgressBeforeMount.mockResolvedValue(new Err(setupError));
    mockMountConversationFiles.mockResolvedValue(
      new Err(new Error("mount failed"))
    );

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(setupError);
    }
    expect(mockMountConversationFiles).toHaveBeenCalledTimes(1);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
  });

  it("short-circuits when mounting conversation files fails", async () => {
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
      })
    );
    mockMountConversationFiles.mockResolvedValue(
      new Err(new Error("mount failed"))
    );

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnsureSandboxEgressOnExec).not.toHaveBeenCalled();
  });

  it("short-circuits when refreshing the GCS token fails", async () => {
    mockRefreshGcsToken.mockResolvedValue(new Err(new Error("refresh failed")));

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
