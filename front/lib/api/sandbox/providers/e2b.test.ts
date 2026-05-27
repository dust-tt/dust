import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCommandHandleWait,
  mockConnect,
  mockCreate,
  mockCreateCommandRun,
  mockKill,
  mockLoggerError,
  mockLoggerInfo,
  mockRun,
  mockSendStdin,
  mockCloseStdin,
  mockTrace,
} = vi.hoisted(() => ({
  mockCommandHandleWait: vi.fn(),
  mockConnect: vi.fn(),
  mockCreate: vi.fn(),
  mockCreateCommandRun: vi.fn(),
  mockKill: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockRun: vi.fn(),
  mockSendStdin: vi.fn(),
  mockCloseStdin: vi.fn(),
  mockTrace: vi.fn(),
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    error: mockLoggerError,
    info: mockLoggerInfo,
  },
}));

vi.mock("@app/logger/tracer", () => ({
  default: {
    trace: mockTrace,
  },
}));

vi.mock("e2b", () => {
  class CommandExitError extends Error {
    exitCode: number;
    stdout: string;
    stderr: string;

    constructor({
      exitCode,
      stdout,
      stderr,
    }: {
      exitCode: number;
      stdout: string;
      stderr: string;
    }) {
      super("command failed");
      this.exitCode = exitCode;
      this.stdout = stdout;
      this.stderr = stderr;
    }
  }

  class NotFoundError extends Error {}

  return {
    CommandExitError,
    NotFoundError,
    Sandbox: {
      connect: mockConnect,
      create: mockCreate,
      kill: mockKill,
    },
  };
});

import { CommandExitError } from "e2b";

import { SANDBOX_ROOT_SAFE_PATH } from "../hardening";
import { E2BSandboxProvider } from "./e2b";

describe("E2BSandboxProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrace.mockImplementation(
      async (
        _name: string,
        _opts: unknown,
        fn: (span: { setTag: (key: string, value: string) => void }) => unknown
      ) => fn({ setTag: vi.fn() })
    );
    mockCommandHandleWait.mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });
    mockRun.mockResolvedValue({
      pid: 123,
      wait: mockCommandHandleWait,
    });
    mockSendStdin.mockResolvedValue(undefined);
    mockCloseStdin.mockResolvedValue(undefined);
    mockCreateCommandRun.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    mockCreate.mockResolvedValue({
      sandboxId: "sandbox-id",
      commands: {
        run: mockCreateCommandRun,
      },
    });
    mockKill.mockResolvedValue(undefined);
    mockConnect.mockResolvedValue({
      commands: {
        run: mockRun,
        sendStdin: mockSendStdin,
        closeStdin: mockCloseStdin,
      },
    });
  });

  it("hardens E2B-created local accounts before returning a sandbox", async () => {
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.create(
      {
        imageId: { imageName: "dust-base", tag: "0.8.30" },
        network: { mode: "deny_all" },
        resources: { vcpu: 2, memoryMb: 2048 },
      },
      { workspaceId: "workspace-id" }
    );

    expect(result).toEqual(new Ok({ providerId: "sandbox-id" }));
    const hardeningCommand = mockCreateCommandRun.mock.calls[0][0];
    if (typeof hardeningCommand !== "string") {
      throw new Error("expected hardeningCommand to be a string");
    }
    expect(hardeningCommand).toContain(
      `PATH='${SANDBOX_ROOT_SAFE_PATH}' HOME=/root`
    );
    expect(hardeningCommand).toContain("/bin/bash --noprofile --norc -c");
    expect(hardeningCommand).toContain("zz-dust-root-safe-path.sh");
    expect(mockCreateCommandRun).toHaveBeenCalledWith(
      expect.stringContaining(
        "usermod --lock --expiredate 1 --shell /usr/sbin/nologin user"
      ),
      {
        timeoutMs: 120_000,
        user: "root",
      }
    );
    expect(hardeningCommand).toContain(
      "sudo must not be installed in sandbox images"
    );
    expect(hardeningCommand).toContain(
      "install -d -o root -g root -m 755 /opt/bin /usr/local /usr/local/sbin /usr/local/bin /usr/local/lib"
    );
    expect(hardeningCommand).toContain("/usr/local/lib/systemd/system");
    expect(hardeningCommand).toContain("/run/systemd/system");
    expect(hardeningCommand).toContain(
      "for path in /opt/bin/dsbx /usr/local/bin/dust-install-trust-bundle"
    );
    expect(hardeningCommand).toContain("privileged primary group");
    expect(mockKill).not.toHaveBeenCalled();
  });

  it("runs root commands with a safe PATH that excludes agent-writable directories", async () => {
    mockRun.mockResolvedValueOnce({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.exec(
      "provider-id",
      "nohup /bin/true",
      { user: "root" },
      { workspaceId: "workspace-id" }
    );

    expect(result).toEqual(new Ok({ exitCode: 0, stdout: "ok", stderr: "" }));
    const command = mockRun.mock.calls[0][0];
    if (typeof command !== "string") {
      throw new Error("expected command to be a string");
    }
    expect(command).toContain(`PATH='${SANDBOX_ROOT_SAFE_PATH}'`);
    expect(command).toContain("HOME=/root");
    expect(command).toContain("BASH_ENV=/dev/null");
    expect(command).toContain("ENV=/dev/null");
    expect(command).toContain("/bin/bash --noprofile --norc -c");
    expect(command).toContain("nohup /bin/true");
    expect(command).not.toContain("/opt/venv/bin");
    expect(command).not.toContain("/home/agent/.local/bin");
  });

  it("does not wrap non-root commands", async () => {
    mockRun.mockResolvedValueOnce({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.exec(
      "provider-id",
      "echo ok",
      { user: "agent-proxied" },
      { workspaceId: "workspace-id" }
    );

    expect(result).toEqual(new Ok({ exitCode: 0, stdout: "ok", stderr: "" }));
    expect(mockRun).toHaveBeenCalledWith(
      "echo ok",
      expect.objectContaining({ user: "agent-proxied" })
    );
  });

  it("kills a sandbox if local account hardening fails after create", async () => {
    mockCreateCommandRun.mockResolvedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "user still in sudo",
    });
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.create(
      {
        imageId: { imageName: "dust-base", tag: "0.8.30" },
        network: { mode: "deny_all" },
        resources: { vcpu: 2, memoryMb: 2048 },
      },
      { workspaceId: "workspace-id" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "E2B sandbox local account hardening failed"
      );
    }
    expect(mockKill).toHaveBeenCalledWith("sandbox-id", {
      apiKey: "api-key",
    });
  });

  it("preserves hardening context when the E2B SDK throws a command exit error", async () => {
    mockCreateCommandRun.mockRejectedValueOnce(
      new CommandExitError({
        exitCode: 1,
        stdout: "",
        stderr: "privileged primary group sudo must not include user",
      })
    );
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.create(
      {
        imageId: { imageName: "dust-base", tag: "0.8.30" },
        network: { mode: "deny_all" },
        resources: { vcpu: 2, memoryMb: 2048 },
      },
      { workspaceId: "workspace-id" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "E2B sandbox local account hardening failed with exit code 1"
      );
      expect(result.error.message).toContain(
        "privileged primary group sudo must not include user"
      );
    }
    expect(mockKill).toHaveBeenCalledWith("sandbox-id", {
      apiKey: "api-key",
    });
  });

  it("sends stdin through the command handle without putting it in argv", async () => {
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });
    const stdin = "super-secret-json";
    const command = "install -m 600 /dev/stdin /run/dust/egress-secrets.json";

    const result = await provider.exec(
      "provider-id",
      command,
      {
        stdin,
        timeoutMs: 5_000,
        user: "root",
      },
      { workspaceId: "workspace-id" }
    );

    expect(result).toEqual(new Ok({ exitCode: 0, stdout: "ok", stderr: "" }));
    const wrappedCommand = mockRun.mock.calls[0][0];
    if (typeof wrappedCommand !== "string") {
      throw new Error("expected wrappedCommand to be a string");
    }
    expect(wrappedCommand).toContain(`PATH='${SANDBOX_ROOT_SAFE_PATH}'`);
    expect(wrappedCommand).toContain("/bin/bash --noprofile --norc -c");
    expect(wrappedCommand).toContain(command);
    expect(mockRun).toHaveBeenCalledWith(
      wrappedCommand,
      expect.objectContaining({
        background: true,
        stdin: true,
        timeoutMs: 5_000,
        user: "root",
      })
    );
    expect(wrappedCommand).not.toContain(stdin);
    expect(JSON.stringify(mockRun.mock.calls[0][1])).not.toContain(stdin);
    expect(mockSendStdin).toHaveBeenCalledWith(123, stdin, {
      requestTimeoutMs: 30_000,
    });
    expect(mockCloseStdin).toHaveBeenCalledWith(123, {
      requestTimeoutMs: 30_000,
    });
    expect(mockCommandHandleWait).toHaveBeenCalledTimes(1);
  });

  it("kills the background handle when sendStdin fails to avoid orphaned commands", async () => {
    const mockHandleKill = vi.fn().mockResolvedValue(true);
    mockRun.mockResolvedValueOnce({
      pid: 123,
      wait: mockCommandHandleWait,
      kill: mockHandleKill,
    });
    mockSendStdin.mockRejectedValueOnce(new Error("network blip"));

    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.exec(
      "provider-id",
      "install -m 600 /dev/stdin /run/dust/egress-secrets.json",
      { stdin: "secret-json", timeoutMs: 5_000, user: "root" },
      { workspaceId: "workspace-id" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("network blip");
    }
    expect(mockHandleKill).toHaveBeenCalledTimes(1);
    expect(mockCloseStdin).not.toHaveBeenCalled();
    expect(mockCommandHandleWait).not.toHaveBeenCalled();
  });
});
