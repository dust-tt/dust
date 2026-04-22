import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckEgressForwarderHealth,
  mockReadNewDenyLogEntries,
  mockGenerateExecId,
  mockGenerateSandboxExecToken,
  mockGetSandboxImage,
  mockMountConversationFiles,
  mockRecordToolDuration,
  mockRefreshGcsToken,
  mockRevokeExecToken,
  mockSetupEgressForwarder,
  mockStartTelemetry,
  mockWrapCommand,
  mockEnsureActive,
} = vi.hoisted(() => ({
  mockCheckEgressForwarderHealth: vi.fn(),
  mockReadNewDenyLogEntries: vi.fn(),
  mockGenerateExecId: vi.fn(),
  mockGenerateSandboxExecToken: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockMountConversationFiles: vi.fn(),
  mockRecordToolDuration: vi.fn(),
  mockRefreshGcsToken: vi.fn(),
  mockRevokeExecToken: vi.fn(),
  mockSetupEgressForwarder: vi.fn(),
  mockStartTelemetry: vi.fn(),
  mockWrapCommand: vi.fn(),
  mockEnsureActive: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getClientFacingUrl: () => "https://dust.tt",
    getSandboxDevFrontHostName: () => undefined,
  },
}));

vi.mock("@app/lib/api/sandbox/egress", () => ({
  checkEgressForwarderHealth: mockCheckEgressForwarderHealth,
  readNewDenyLogEntries: mockReadNewDenyLogEntries,
  setupEgressForwarder: mockSetupEgressForwarder,
}));

vi.mock("@app/lib/api/sandbox/access_tokens", () => ({
  generateExecId: mockGenerateExecId,
  generateSandboxExecToken: mockGenerateSandboxExecToken,
  revokeExecToken: mockRevokeExecToken,
}));

vi.mock("@app/lib/api/sandbox/gcs/mount", () => ({
  mountConversationFiles: mockMountConversationFiles,
  refreshGcsToken: mockRefreshGcsToken,
}));

vi.mock("@app/lib/api/sandbox/image", () => ({
  getSandboxImage: mockGetSandboxImage,
}));

vi.mock("@app/lib/api/sandbox/image/profile", () => ({
  wrapCommand: mockWrapCommand,
}));

vi.mock("@app/lib/api/sandbox/instrumentation", () => ({
  recordToolDuration: mockRecordToolDuration,
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
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { runSandboxBashTool } from "./index";

describe("runSandboxBashTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGenerateExecId.mockReturnValue("exec-1");
    mockGenerateSandboxExecToken.mockResolvedValue("sandbox-token");
    mockGetSandboxImage.mockReturnValue(new Ok({}));
    mockMountConversationFiles.mockResolvedValue(new Ok(undefined));
    mockRefreshGcsToken.mockResolvedValue(new Ok(undefined));
    mockReadNewDenyLogEntries.mockResolvedValue(new Ok([]));
    mockRevokeExecToken.mockResolvedValue(undefined);
    mockSetupEgressForwarder.mockResolvedValue(new Ok(undefined));
    mockStartTelemetry.mockResolvedValue(undefined);
    mockWrapCommand.mockImplementation(
      (command: string) => `wrapped:${command}`
    );
  });

  function makeExtra() {
    return {
      auth: {
        getNonNullableWorkspace: () => ({ sId: "workspace-id" }),
      },
      agentLoopContext: {
        runContext: {
          agentConfiguration: {
            model: { providerId: "openai" },
            sId: "agent-id",
          },
          agentMessage: { sId: "message-id" },
          conversation: { sId: "conversation-id" },
        },
      },
      signal: new AbortController().signal,
    } as never;
  }

  it("executes as agent-proxied when the forwarder is healthy", async () => {
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi
        .fn()
        .mockResolvedValue(
          new Ok({ exitCode: 0, stdout: "hello", stderr: "" })
        ),
    };

    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox,
        wokeFromSleep: false,
      })
    );

    mockCheckEgressForwarderHealth.mockResolvedValue(new Ok(true));

    const result = await runSandboxBashTool(
      { command: "echo hello", description: "Run command" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockSetupEgressForwarder).not.toHaveBeenCalled();
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.anything(),
      "wrapped:echo hello",
      expect.objectContaining({
        user: "agent-proxied",
      })
    );
  });

  it("restarts the forwarder when the health check fails", async () => {
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi
        .fn()
        .mockResolvedValue(
          new Ok({ exitCode: 0, stdout: "hello", stderr: "" })
        ),
    };

    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox,
        wokeFromSleep: true,
      })
    );

    mockCheckEgressForwarderHealth.mockResolvedValue(new Ok(false));

    const result = await runSandboxBashTool(
      { command: "echo hello", description: "Run command" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockSetupEgressForwarder).toHaveBeenCalledTimes(1);
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.anything(),
      "wrapped:echo hello",
      expect.objectContaining({
        user: "agent-proxied",
      })
    );
    expect(mockRecordToolDuration).toHaveBeenCalledWith(
      "bash",
      expect.any(Number),
      { workspaceId: "workspace-id" },
      "success"
    );
  });

  it("returns an MCP error when egress setup fails", async () => {
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi.fn(),
    };

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

    const result = await runSandboxBashTool(
      { command: "echo hello", description: "Run command" },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("setup failed");
    }
    expect(sandbox.exec).not.toHaveBeenCalled();
  });
});
