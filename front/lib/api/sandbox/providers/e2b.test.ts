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

  class TimeoutError extends Error {}

  return {
    CommandExitError,
    NotFoundError,
    TimeoutError,
    Sandbox: {
      connect: mockConnect,
      create: mockCreate,
      kill: mockKill,
    },
  };
});

import { CommandExitError, NotFoundError, TimeoutError } from "e2b";

import {
  SANDBOX_AGENT_PROXIED_SAFE_PATH,
  SANDBOX_AGENT_SAFE_PATH,
  SANDBOX_AGENT_SERVICE_HOME,
  SANDBOX_ROOT_SAFE_PATH,
} from "../hardening";
import { isSandboxExecTimeoutError } from "../provider";
import { rootCommand } from "../root_command";
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
    expect(hardeningCommand).toContain("/usr/bin/systemd-analyze unit-paths");
    expect(hardeningCommand).toContain("systemd unit path must be absolute");
    expect(hardeningCommand).toContain(
      "for path in /opt/bin/dsbx /usr/local/bin/dust-install-trust-bundle"
    );
    expect(hardeningCommand).toContain(
      "/usr/bin/chown -R root:agent /home/agent"
    );
    expect(hardeningCommand).toContain("/usr/bin/chown -R root:root /opt/venv");
    expect(hardeningCommand).toContain("/bin/chmod 644 /opt/dust/profile/*.sh");
    expect(hardeningCommand).toContain("privileged primary group");
    expect(mockKill).not.toHaveBeenCalled();
  });

  it("runs root commands with a safe PATH that excludes agent-writable directories", async () => {
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.execRoot(
      "provider-id",
      rootCommand.nohup(rootCommand.exec("/bin/true")),
      undefined,
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

  it("rejects raw root commands on the generic exec path", async () => {
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.exec(
      "provider-id",
      "cat /tmp/deny.log",
      // @ts-expect-error Root commands must use execRoot.
      { user: "root" },
      { workspaceId: "workspace-id" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Use execRoot()");
    }
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("rejects unsupported users on the generic exec path", async () => {
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const uidResult = await provider.exec(
      "provider-id",
      "id",
      // @ts-expect-error Only SandboxExecUser values are allowed.
      { user: "0" },
      { workspaceId: "workspace-id" }
    );

    expect(uidResult.isErr()).toBe(true);
    if (uidResult.isErr()) {
      expect(uidResult.error.message).toContain("Invalid sandbox exec user: 0");
    }

    const localUserResult = await provider.exec(
      "provider-id",
      "id",
      // @ts-expect-error The legacy local user account must not be a runtime exec target.
      { user: "user" },
      { workspaceId: "workspace-id" }
    );

    expect(localUserResult.isErr()).toBe(true);
    if (localUserResult.isErr()) {
      expect(localUserResult.error.message).toContain(
        "Invalid sandbox exec user: user"
      );
    }
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("runs default agent service commands without sourcing user dotfiles", async () => {
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.exec("provider-id", "echo ok", undefined, {
      workspaceId: "workspace-id",
    });

    expect(result).toEqual(new Ok({ exitCode: 0, stdout: "ok", stderr: "" }));
    const command = mockRun.mock.calls[0][0];
    if (typeof command !== "string") {
      throw new Error("expected command to be a string");
    }
    expect(command).toContain(`PATH='${SANDBOX_AGENT_SAFE_PATH}'`);
    expect(command).toContain(`HOME='${SANDBOX_AGENT_SERVICE_HOME}'`);
    expect(command).toContain("BASH_ENV=/dev/null");
    expect(command).toContain("ENV=/dev/null");
    expect(command).toContain("/bin/bash --noprofile --norc -c 'echo ok'");
    expect(command).not.toContain("/opt/venv/bin");
    expect(command).not.toContain("/home/agent/.local/bin");
    expect(mockRun).toHaveBeenCalledWith(
      command,
      expect.objectContaining({
        envs: {
          BASH_ENV: "/dev/null",
          ENV: "/dev/null",
          HOME: SANDBOX_AGENT_SERVICE_HOME,
          PATH: SANDBOX_AGENT_SAFE_PATH,
        },
        user: "agent",
      })
    );
  });

  it("runs agent-proxied workload commands in a clean shell with its own home", async () => {
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.exec(
      "provider-id",
      "echo ok",
      {
        envVars: {
          BASH_ENV: "/tmp/attacker/bash-env",
          ENV: "/tmp/attacker/env",
          HOME: "/home/agent-proxied",
          PATH: "/tmp/attacker/bin",
          SAFE_INPUT: "preserved",
        },
        user: "agent-proxied",
      },
      { workspaceId: "workspace-id" }
    );

    expect(result).toEqual(new Ok({ exitCode: 0, stdout: "ok", stderr: "" }));
    const command = mockRun.mock.calls[0][0];
    if (typeof command !== "string") {
      throw new Error("expected command to be a string");
    }
    expect(command).toContain(`PATH='${SANDBOX_AGENT_PROXIED_SAFE_PATH}'`);
    expect(command).toContain("HOME='/home/agent-proxied'");
    expect(command).toContain("BASH_ENV=/dev/null");
    expect(command).toContain("ENV=/dev/null");
    expect(command).toContain("/bin/bash --noprofile --norc -c 'echo ok'");
    expect(mockRun).toHaveBeenCalledWith(
      command,
      expect.objectContaining({
        envs: {
          BASH_ENV: "/dev/null",
          ENV: "/dev/null",
          HOME: SANDBOX_AGENT_SERVICE_HOME,
          PATH: SANDBOX_AGENT_SAFE_PATH,
          SAFE_INPUT: "preserved",
        },
        user: "agent-proxied",
      })
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

  it("hands small stdin to the command through the environment when allowed", async () => {
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });
    const stdin = '{"message":"hi"}';
    const command = "/opt/bin/dsbx function run greet";

    const result = await provider.exec(
      "provider-id",
      command,
      {
        stdin,
        allowStdinInEnvironment: true,
        timeoutMs: 5_000,
        user: "agent-proxied",
      },
      { workspaceId: "workspace-id" }
    );

    expect(result).toEqual(new Ok({ exitCode: 0, stdout: "ok", stderr: "" }));
    const wrappedCommand = mockRun.mock.calls[0][0];
    if (typeof wrappedCommand !== "string") {
      throw new Error("expected wrappedCommand to be a string");
    }
    expect(wrappedCommand).toContain("/bin/bash --noprofile --norc -c");
    expect(wrappedCommand).toContain(command);
    // The payload travels in the environment and is unexported before the command starts. What it
    // must never reach is argv, which is world-readable through /proc.
    expect(wrappedCommand).toContain(`printf '%s' "$__dust_stdin"`);
    expect(wrappedCommand).toContain("unset DUST_EXEC_STDIN");
    expect(wrappedCommand).not.toContain(stdin);
    // `exec` keeps the pid envd started as the pid running the workload. Without it envd holds a
    // wrapper shell, and killing that on timeout leaves the workload running as a grandchild.
    expect(wrappedCommand).toContain("exec /bin/bash");
    expect(wrappedCommand).not.toContain("| {");
    expect(mockRun).toHaveBeenCalledWith(
      wrappedCommand,
      expect.objectContaining({
        background: true,
        envs: expect.objectContaining({ DUST_EXEC_STDIN: stdin }),
        timeoutMs: 5_000,
        user: "agent-proxied",
      })
    );
    // Asking envd to hold stdin open is what costs the two extra calls, so the inline path must
    // not request it at all.
    expect(mockRun.mock.calls[0][1]).not.toHaveProperty("stdin");
    expect(mockSendStdin).not.toHaveBeenCalled();
    expect(mockCloseStdin).not.toHaveBeenCalled();
    expect(mockCommandHandleWait).toHaveBeenCalledTimes(1);
  });

  it("streams stdin that is too large to pass through the environment", async () => {
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });
    const stdin = "x".repeat(64 * 1_024);

    const result = await provider.exec(
      "provider-id",
      "/opt/bin/dsbx function run big",
      { stdin, allowStdinInEnvironment: true, user: "agent-proxied" },
      { workspaceId: "workspace-id" }
    );

    expect(result).toEqual(new Ok({ exitCode: 0, stdout: "ok", stderr: "" }));
    expect(mockRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ background: true, stdin: true })
    );
    expect(JSON.stringify(mockRun.mock.calls[0][1])).not.toContain(stdin);
    expect(mockSendStdin).toHaveBeenCalledWith(123, stdin, {
      requestTimeoutMs: 30_000,
    });
    expect(mockCloseStdin).toHaveBeenCalledWith(123, {
      requestTimeoutMs: 30_000,
    });
  });

  it("streams binary stdin, which an environment value cannot carry", async () => {
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });
    const stdin = new Uint8Array([0, 1, 2, 3]);

    const result = await provider.exec(
      "provider-id",
      "/opt/bin/dsbx function run binary",
      { stdin, allowStdinInEnvironment: true, user: "agent-proxied" },
      { workspaceId: "workspace-id" }
    );

    expect(result).toEqual(new Ok({ exitCode: 0, stdout: "ok", stderr: "" }));
    expect(mockRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ background: true, stdin: true })
    );
    expect(mockSendStdin).toHaveBeenCalledWith(123, stdin, {
      requestTimeoutMs: 30_000,
    });
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

    const result = await provider.execRoot(
      "provider-id",
      rootCommand.unsafeShell(
        "install -m 600 /dev/stdin /run/dust/egress-secrets.json",
        "test legacy stdin root command"
      ),
      { stdin: "secret-json".repeat(8_192), timeoutMs: 5_000 },
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

  it("recovers the command result when the process exits before stdin arrives", async () => {
    const mockHandleKill = vi.fn().mockResolvedValue(false);
    mockRun.mockResolvedValueOnce({
      pid: 123,
      wait: mockCommandHandleWait,
      kill: mockHandleKill,
    });
    mockSendStdin.mockRejectedValueOnce(
      new NotFoundError("[not_found] process with pid 123 not found")
    );
    mockCommandHandleWait.mockRejectedValueOnce(
      new CommandExitError({
        exitCode: 1,
        stdout: '{"error":"function not found: new-function"}',
        stderr: "",
      })
    );

    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.exec(
      "provider-id",
      "/opt/bin/dsbx function run new-function",
      { stdin: "request-json".repeat(8_192), user: "agent-proxied" },
      { workspaceId: "workspace-id" }
    );

    expect(result).toEqual(
      new Ok({
        exitCode: 1,
        stdout: '{"error":"function not found: new-function"}',
        stderr: "",
      })
    );
    expect(mockCommandHandleWait).toHaveBeenCalledTimes(1);
    expect(mockHandleKill).not.toHaveBeenCalled();
    expect(mockCloseStdin).not.toHaveBeenCalled();
  });

  it("returns a typed timeout error carrying the budget when a command runs past it", async () => {
    mockCommandHandleWait.mockRejectedValueOnce(
      new TimeoutError(
        "[deadline_exceeded] the operation timed out: This error is likely due to exceeding " +
          "'timeoutMs'. You can pass the timeout value in 'timeoutMs' when making the request."
      )
    );
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.exec(
      "provider-id",
      "/opt/bin/dsbx function run slow-function",
      { timeoutMs: 10_000, user: "agent-proxied" },
      { workspaceId: "workspace-id" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("expected an error");
    }
    if (!isSandboxExecTimeoutError(result.error)) {
      throw new Error("expected a SandboxExecTimeoutError");
    }
    expect(result.error.timeoutMs).toBe(10_000);
    // The SDK's advice ("pass 'timeoutMs'") targets this file, not our callers.
    expect(result.error.message).not.toContain("timeoutMs");
  });

  it("reports the SDK's own default budget when a command without timeoutMs times out", async () => {
    mockCommandHandleWait.mockRejectedValueOnce(
      new TimeoutError("[deadline_exceeded] the operation timed out")
    );
    const provider = new E2BSandboxProvider({
      apiKey: "api-key",
      domain: undefined,
    });

    const result = await provider.exec(
      "provider-id",
      "/opt/bin/dsbx function run slow-function",
      { user: "agent-proxied" },
      { workspaceId: "workspace-id" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("expected an error");
    }
    if (!isSandboxExecTimeoutError(result.error)) {
      throw new Error("expected a SandboxExecTimeoutError");
    }
    expect(result.error.timeoutMs).toBe(60_000);
  });

  describe("connection reuse", () => {
    it("connects once for repeated operations on the same sandbox", async () => {
      const provider = new E2BSandboxProvider({
        apiKey: "api-key",
        domain: undefined,
      });

      await provider.exec("provider-id", "echo one", undefined, {
        workspaceId: "workspace-id",
      });
      await provider.exec("provider-id", "echo two", undefined, {
        workspaceId: "workspace-id",
      });

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalledTimes(2);
    });

    it("keeps a connection per sandbox", async () => {
      const provider = new E2BSandboxProvider({
        apiKey: "api-key",
        domain: undefined,
      });

      await provider.exec("provider-a", "echo a", undefined, {
        workspaceId: "workspace-id",
      });
      await provider.exec("provider-b", "echo b", undefined, {
        workspaceId: "workspace-id",
      });

      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it("shares one connect between operations racing on a cold cache", async () => {
      const provider = new E2BSandboxProvider({
        apiKey: "api-key",
        domain: undefined,
      });

      await Promise.all([
        provider.exec("provider-id", "echo one", undefined, {
          workspaceId: "workspace-id",
        }),
        provider.exec("provider-id", "echo two", undefined, {
          workspaceId: "workspace-id",
        }),
      ]);

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it("never re-runs a command whose start reported failure", async () => {
      const provider = new E2BSandboxProvider({
        apiKey: "api-key",
        domain: undefined,
      });

      await provider.exec("provider-id", "echo warm", undefined, {
        workspaceId: "workspace-id",
      });
      mockRun.mockRejectedValueOnce(new Error("connection refused"));

      const result = await provider.exec("provider-id", "echo two", undefined, {
        workspaceId: "workspace-id",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("connection refused");
      }
      // The SDK aborts a start on its own request timeout, which can fire after envd has already
      // forked the process. A failed start is not proof that nothing ran, and pod functions are
      // not idempotent, so the error is surfaced rather than retried.
      expect(mockRun).toHaveBeenCalledTimes(2);
    });

    it("drops a connection that failed so the next command reconnects", async () => {
      const provider = new E2BSandboxProvider({
        apiKey: "api-key",
        domain: undefined,
      });

      await provider.exec("provider-id", "echo warm", undefined, {
        workspaceId: "workspace-id",
      });
      mockRun.mockRejectedValueOnce(new Error("connection refused"));
      await provider.exec("provider-id", "echo two", undefined, {
        workspaceId: "workspace-id",
      });

      const result = await provider.exec(
        "provider-id",
        "echo three",
        undefined,
        { workspaceId: "workspace-id" }
      );

      expect(result).toEqual(new Ok({ exitCode: 0, stdout: "ok", stderr: "" }));
      // One for the first command, one for the command after the failure.
      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it("retries a file read on a fresh connection", async () => {
      const mockFilesRead = vi.fn().mockResolvedValue(new Uint8Array([1, 2]));
      mockConnect.mockResolvedValue({
        commands: {
          run: mockRun,
          sendStdin: mockSendStdin,
          closeStdin: mockCloseStdin,
        },
        files: { read: mockFilesRead },
      });
      const provider = new E2BSandboxProvider({
        apiKey: "api-key",
        domain: undefined,
      });

      await provider.readFile("provider-id", "/tmp/a", {
        workspaceId: "workspace-id",
      });
      mockFilesRead.mockRejectedValueOnce(new Error("connection refused"));

      // Reading the same path twice returns the same bytes, so unlike a command this is safe to
      // repeat once the stale connection has been replaced.
      const result = await provider.readFile("provider-id", "/tmp/a", {
        workspaceId: "workspace-id",
      });

      expect(result).toEqual(Buffer.from([1, 2]));
      expect(mockConnect).toHaveBeenCalledTimes(2);
      expect(mockFilesRead).toHaveBeenCalledTimes(3);
    });

    it("drops the cached connection when the sandbox is paused", async () => {
      const mockBetaPause = vi.fn().mockResolvedValue(undefined);
      mockConnect.mockResolvedValue({
        betaPause: mockBetaPause,
        commands: {
          run: mockRun,
          sendStdin: mockSendStdin,
          closeStdin: mockCloseStdin,
        },
      });
      const provider = new E2BSandboxProvider({
        apiKey: "api-key",
        domain: undefined,
      });

      await provider.exec("provider-id", "echo warm", undefined, {
        workspaceId: "workspace-id",
      });
      await provider.sleep("provider-id", { workspaceId: "workspace-id" });
      await provider.exec("provider-id", "echo after", undefined, {
        workspaceId: "workspace-id",
      });

      expect(mockBetaPause).toHaveBeenCalledTimes(1);
      // One for the first exec, one for the pause, and one for the exec after it: a handle from
      // before the pause points at a suspended VM.
      expect(mockConnect).toHaveBeenCalledTimes(3);
    });

    it("drops the cached connection when the sandbox is destroyed", async () => {
      const provider = new E2BSandboxProvider({
        apiKey: "api-key",
        domain: undefined,
      });

      await provider.exec("provider-id", "echo warm", undefined, {
        workspaceId: "workspace-id",
      });
      await provider.destroy("provider-id", { workspaceId: "workspace-id" });
      await provider.exec("provider-id", "echo after", undefined, {
        workspaceId: "workspace-id",
      });

      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it("does not reconnect when the sandbox reports a missing file", async () => {
      const mockFilesRead = vi.fn().mockResolvedValue(new Uint8Array([1, 2]));
      mockConnect.mockResolvedValue({
        commands: {
          run: mockRun,
          sendStdin: mockSendStdin,
          closeStdin: mockCloseStdin,
        },
        files: { read: mockFilesRead },
      });
      const provider = new E2BSandboxProvider({
        apiKey: "api-key",
        domain: undefined,
      });

      await provider.readFile("provider-id", "/tmp/a", {
        workspaceId: "workspace-id",
      });
      mockFilesRead.mockRejectedValueOnce(new NotFoundError("no such file"));

      await expect(
        provider.readFile("provider-id", "/tmp/missing", {
          workspaceId: "workspace-id",
        })
      ).rejects.toThrow("no such file");
      // The sandbox answered, so the connection is fine: reconnecting and reading again would
      // only add round trips to a read that is going to fail either way.
      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockFilesRead).toHaveBeenCalledTimes(2);
    });

    it("reports a sandbox that no longer exists rather than a missing file", async () => {
      mockConnect.mockRejectedValueOnce(new NotFoundError("gone"));
      const provider = new E2BSandboxProvider({
        apiKey: "api-key",
        domain: undefined,
      });

      const result = await provider.exec("provider-id", "echo one", undefined, {
        workspaceId: "workspace-id",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.name).toBe("SandboxNotFoundError");
      }
    });
  });
});
