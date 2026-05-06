import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckEgressForwarderHealth,
  mockEnsureActive,
  mockEnsureConversationFilesMounted,
  mockGetSandboxImage,
  mockLoggerError,
  mockLoggerInfo,
  mockLoggerWarn,
  mockSetupEgressForwarder,
  mockStartTelemetry,
} = vi.hoisted(() => ({
  mockCheckEgressForwarderHealth: vi.fn(),
  mockEnsureActive: vi.fn(),
  mockEnsureConversationFilesMounted: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockSetupEgressForwarder: vi.fn(),
  mockStartTelemetry: vi.fn(),
}));

vi.mock("@app/lib/api/sandbox/egress", () => ({
  checkEgressForwarderHealth: mockCheckEgressForwarderHealth,
  setupEgressForwarder: mockSetupEgressForwarder,
}));

vi.mock("@app/lib/api/sandbox/gcs/mount", () => ({
  ensureConversationFilesMounted: mockEnsureConversationFilesMounted,
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
    mockSetupEgressForwarder.mockResolvedValue(new Ok(undefined));
    mockGetSandboxImage.mockReturnValue(new Ok(image));
    mockStartTelemetry.mockResolvedValue(new Ok(undefined));
    mockEnsureConversationFilesMounted.mockResolvedValue(new Ok(undefined));
    mockCheckEgressForwarderHealth.mockResolvedValue(new Ok(true));
  });

  it("sets up egress, mounts files, and checks health for freshly-created sandboxes", async () => {
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
    expect(mockSetupEgressForwarder).toHaveBeenCalledTimes(1);
    expect(mockEnsureConversationFilesMounted).toHaveBeenCalledWith(
      auth,
      sandbox,
      conversation,
      image
    );
    expect(mockCheckEgressForwarderHealth).toHaveBeenCalledWith(auth, sandbox);

    expect(mockSetupEgressForwarder.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnsureConversationFilesMounted.mock.invocationCallOrder[0]
    );
    expect(
      mockEnsureConversationFilesMounted.mock.invocationCallOrder[0]
    ).toBeLessThan(mockCheckEgressForwarderHealth.mock.invocationCallOrder[0]);
  });

  it("skips initial egress setup but still calls the mount helper for already-running sandboxes", async () => {
    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isOk()).toBe(true);
    expect(mockSetupEgressForwarder).not.toHaveBeenCalled();
    expect(mockEnsureConversationFilesMounted).toHaveBeenCalledWith(
      auth,
      sandbox,
      conversation,
      image
    );
  });

  it("calls the mount helper unconditionally when the sandbox woke from sleep", async () => {
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
    expect(mockSetupEgressForwarder).not.toHaveBeenCalled();
    expect(mockEnsureConversationFilesMounted).toHaveBeenCalledWith(
      auth,
      sandbox,
      conversation,
      image
    );
  });

  it("restarts egress when the post-setup health check fails", async () => {
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
      })
    );
    mockCheckEgressForwarderHealth.mockResolvedValue(new Ok(false));

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isOk()).toBe(true);
    expect(mockSetupEgressForwarder).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      {
        event: "egress.health_fail",
        providerId: "provider-id",
        sandboxId: "sandbox-id",
      },
      "Sandbox egress forwarder health check failed, restarting"
    );
    expect(
      mockCheckEgressForwarderHealth.mock.invocationCallOrder[0]
    ).toBeLessThan(mockSetupEgressForwarder.mock.invocationCallOrder[1]);
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
    expect(mockEnsureConversationFilesMounted).not.toHaveBeenCalled();
    expect(mockCheckEgressForwarderHealth).not.toHaveBeenCalled();
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
    expect(mockSetupEgressForwarder).not.toHaveBeenCalled();
    expect(mockGetSandboxImage).not.toHaveBeenCalled();
  });

  it("short-circuits when initial egress setup fails", async () => {
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
      })
    );
    mockSetupEgressForwarder.mockResolvedValue(
      new Err(new Error("setup failed"))
    );

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockGetSandboxImage).not.toHaveBeenCalled();
    expect(mockEnsureConversationFilesMounted).not.toHaveBeenCalled();
  });

  it("short-circuits when the mount helper fails", async () => {
    mockEnsureConversationFilesMounted.mockResolvedValue(
      new Err(new Error("mount failed"))
    );

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockCheckEgressForwarderHealth).not.toHaveBeenCalled();
  });

  it("short-circuits when the egress health check fails", async () => {
    mockCheckEgressForwarderHealth.mockResolvedValue(
      new Err(new Error("health failed"))
    );

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockSetupEgressForwarder).not.toHaveBeenCalled();
  });

  it("short-circuits when egress restart fails after an unhealthy check", async () => {
    mockCheckEgressForwarderHealth.mockResolvedValue(new Ok(false));
    mockSetupEgressForwarder.mockResolvedValue(
      new Err(new Error("restart failed"))
    );

    const result = await ensureSandboxReady(
      auth as never,
      conversation as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockSetupEgressForwarder).toHaveBeenCalledTimes(1);
  });
});
