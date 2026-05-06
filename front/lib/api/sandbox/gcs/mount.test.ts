import type { ExecOptions, ExecResult } from "@app/lib/api/sandbox/provider";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMintDownscopedGcsToken } = vi.hoisted(() => ({
  mockMintDownscopedGcsToken: vi.fn(),
}));

vi.mock("@app/lib/api/sandbox/gcs/token", () => ({
  mintDownscopedGcsToken: mockMintDownscopedGcsToken,
}));

vi.mock("@app/lib/file_storage/config", () => ({
  default: {
    getGcsPrivateUploadsBucket: () => "test-bucket",
  },
}));

vi.mock("@app/lib/api/files/mount_path", () => ({
  getConversationFilesBasePath: ({
    workspaceId,
    conversationId,
  }: {
    workspaceId: string;
    conversationId: string;
  }) => `w/${workspaceId}/conversations/${conversationId}/files/`,
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

import {
  buildProbeAndSetupScript,
  buildUnmountAndMountScript,
  ensureConversationFilesMounted,
} from "./mount";

const auth = {
  getNonNullableWorkspace: () => ({ sId: "workspace-id" }),
} as never;
const conversation = { sId: "conversation-id" } as never;
const image = { hasCapability: (c: string) => c === "gcsfuse" } as never;
const noFuseImage = { hasCapability: () => false } as never;

type ExecImpl = (
  auth: unknown,
  cmd: string,
  opts?: ExecOptions
) => Promise<Result<ExecResult, Error>>;

function makeSandbox(execImpl: ExecImpl) {
  return {
    sId: "sandbox-id",
    exec: vi.fn(execImpl),
  };
}

const okExec = (
  overrides: Partial<ExecResult> = {}
): Promise<Result<ExecResult, Error>> =>
  Promise.resolve(
    new Ok({
      exitCode: 0,
      stdout: "",
      stderr: "",
      ...overrides,
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockMintDownscopedGcsToken.mockResolvedValue(
    new Ok({ accessToken: "tok", expiresInSeconds: 3600 })
  );
});

describe("ensureConversationFilesMounted", () => {
  it("returns Ok and skips work when the image has no gcsfuse capability", async () => {
    const sandbox = makeSandbox(() => okExec());
    const result = await ensureConversationFilesMounted(
      auth,
      sandbox as never,
      conversation,
      noFuseImage
    );
    expect(result.isOk()).toBe(true);
    expect(sandbox.exec).not.toHaveBeenCalled();
    expect(mockMintDownscopedGcsToken).not.toHaveBeenCalled();
  });

  it("hot path: probe says READY, runs exactly one exec, no root call", async () => {
    const sandbox = makeSandbox(() => okExec({ stdout: "READY\n" }));

    const result = await ensureConversationFilesMounted(
      auth,
      sandbox as never,
      conversation,
      image
    );

    expect(result.isOk()).toBe(true);
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
    const [, , opts] = sandbox.exec.mock.calls[0];
    expect(opts).toBeUndefined();
  });

  it("cold path: probe says NEEDS_MOUNT, runs probe + root mount", async () => {
    const sandbox = makeSandbox((_a, _cmd, opts) => {
      if (opts?.user === "root") {
        return okExec();
      }
      return okExec({ stdout: "NEEDS_MOUNT\n" });
    });

    const result = await ensureConversationFilesMounted(
      auth,
      sandbox as never,
      conversation,
      image
    );

    expect(result.isOk()).toBe(true);
    expect(sandbox.exec).toHaveBeenCalledTimes(2);

    const [, agentCmd, agentOpts] = sandbox.exec.mock.calls[0];
    expect(agentOpts).toBeUndefined();
    expect(agentCmd).toContain("mountpoint -q /files/conversation");
    expect(agentCmd).toContain("token-server.sh");

    const [, rootCmd, rootOpts] = sandbox.exec.mock.calls[1];
    expect(rootOpts).toMatchObject({ user: "root" });
    expect(rootCmd).toContain("fusermount -u -z /files/conversation");
    expect(rootCmd).toContain("gcsfuse");
  });

  it("returns Err when token minting fails", async () => {
    mockMintDownscopedGcsToken.mockResolvedValue(
      new Err(new Error("mint failed"))
    );
    const sandbox = makeSandbox(() => okExec());

    const result = await ensureConversationFilesMounted(
      auth,
      sandbox as never,
      conversation,
      image
    );

    expect(result.isErr()).toBe(true);
    expect(sandbox.exec).not.toHaveBeenCalled();
  });

  it("returns Err when the probe/setup exec returns non-zero", async () => {
    const sandbox = makeSandbox(() =>
      okExec({ exitCode: 1, stderr: "token server did not become ready" })
    );

    const result = await ensureConversationFilesMounted(
      auth,
      sandbox as never,
      conversation,
      image
    );

    expect(result.isErr()).toBe(true);
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
  });

  it("returns Err when the gcsfuse mount returns non-zero", async () => {
    const sandbox = makeSandbox((_a, _cmd, opts) => {
      if (opts?.user === "root") {
        return okExec({ exitCode: 1, stderr: "mountpoint not empty" });
      }
      return okExec({ stdout: "NEEDS_MOUNT\n" });
    });

    const result = await ensureConversationFilesMounted(
      auth,
      sandbox as never,
      conversation,
      image
    );

    expect(result.isErr()).toBe(true);
    expect(sandbox.exec).toHaveBeenCalledTimes(2);
  });
});

describe("buildProbeAndSetupScript", () => {
  it("includes the mount probe, the token write, and the retry-loop server check", () => {
    const script = buildProbeAndSetupScript({
      tokenJson: '{"access_token":"abc"}',
    });
    expect(script).toContain("mountpoint -q /files/conversation");
    expect(script).toContain("timeout 1 stat /files/conversation");
    expect(script).toContain("curl -sf http://127.0.0.1:9876");
    expect(script).toContain("> /tmp/token.json");
    expect(script).toContain("for _ in 1 2 3 4 5 6 7 8 9 10");
    expect(script).toContain("token_server_alive");
    expect(script).toContain("token-server.sh");
    expect(script).toContain("fuser -k 9876/tcp");
    expect(script).toContain("echo READY");
    expect(script).toContain("echo NEEDS_MOUNT");
  });

  it("escapes single quotes in the token JSON", () => {
    const script = buildProbeAndSetupScript({
      tokenJson: `{"x":"a'b"}`,
    });
    // The escaped form ends a single-quoted segment, inserts an escaped quote,
    // then reopens — so '\'' must appear in the script exactly where the
    // original token contained a quote.
    expect(script).toContain(`a'\\''b`);
  });
});

describe("buildUnmountAndMountScript", () => {
  it("lazy-unmounts before mounting and uses TOKEN_SERVER_URL for the token URL", () => {
    const script = buildUnmountAndMountScript({
      bucket: "b",
      prefix: "w/x/conversations/y/files",
    });
    expect(script.indexOf("fusermount -u -z")).toBeLessThan(
      script.indexOf("gcsfuse")
    );
    expect(script).toContain("--token-url http://127.0.0.1:9876");
    expect(script).toContain("--only-dir w/x/conversations/y/files");
    expect(script).toContain("b /files/conversation");
  });
});
