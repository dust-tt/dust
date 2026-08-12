import { DatabaseSandboxMountAdapter } from "@app/lib/api/file_system/sandbox/database_sandbox_mount_adapter";
import type { FileSystemMount } from "@app/lib/api/file_system/types";
import { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { RootCommand } from "@app/lib/api/sandbox/root_command";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { setupPlainConversation } from "@app/tests/utils/conversation_test_factories";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateToken } = vi.hoisted(() => ({
  generateToken: vi.fn(async () => "scoped-filesystem-token"),
}));

vi.mock(
  import("@app/lib/api/sandbox/access_tokens"),
  async (importOriginal) => {
    const original = await importOriginal();
    return { ...original, generateSandboxFileSystemToken: generateToken };
  }
);

vi.mock("@app/lib/api/config", () => ({
  default: {
    getDustAPIConfig: vi.fn(() => ({
      url: "https://api.example.test",
      nodeEnv: "test",
    })),
  },
}));

const mounts: FileSystemMount[] = [
  {
    kind: "conversation",
    id: "conv1",
    scopedPrefix: "conversation-conv1",
    sandboxMountPoint: "/files/conversation-conv1",
    legacyPrefix: "conversation",
    legacySandboxMountPoint: "/files/conversation",
    permissions: { canRead: true, canWrite: true },
  },
  {
    kind: "pod",
    id: "pod1",
    scopedPrefix: "pod-pod1",
    sandboxMountPoint: "/files/pod-pod1",
    legacyPrefix: "project",
    legacySandboxMountPoint: "/files/pod",
    permissions: { canRead: true, canWrite: true },
  },
];

async function setup() {
  const { auth, conversation } = await setupPlainConversation();
  const sandbox = await SandboxFactory.create(auth, conversation.toJSON());
  const execRoot = vi
    .spyOn(sandbox, "execRoot")
    .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" }));
  const requestKill = vi
    .spyOn(sandbox, "requestKill")
    .mockResolvedValue(undefined);
  return { auth, sandbox, execRoot, requestKill };
}

function commandAt(
  execRoot: { mock: { calls: unknown[][] } },
  index: number
): string {
  return renderRootCommand(execRoot.mock.calls[index][1] as RootCommand);
}

describe("DatabaseSandboxMountAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a scoped token through stdin and mounts one filesystem at /files", async () => {
    const { auth, sandbox, execRoot } = await setup();
    const adapter = new DatabaseSandboxMountAdapter(mounts, []);
    const image =
      SandboxImage.fromDocker("test").withCapability("dust_filesystem");

    const result = await adapter.setup(auth, sandbox, image);

    expect(result.isOk()).toBe(true);
    expect(generateToken).toHaveBeenCalledWith(auth, {
      sandbox,
      conversationId: "conv1",
      spaceId: "pod1",
    });
    expect(execRoot).toHaveBeenCalledTimes(2);
    expect(execRoot.mock.calls[0][2]).toMatchObject({
      stdin: "scoped-filesystem-token",
    });
    const tokenCommand = commandAt(execRoot, 0);
    expect(tokenCommand).not.toContain("scoped-filesystem-token");
    expect(tokenCommand).toContain("/run/dust-filesystem/token");
    expect(tokenCommand).toContain("-m 700 /run/dust-filesystem");

    const mountCommand = commandAt(execRoot, 1);
    expect(mountCommand).toContain("/opt/bin/dsbx filesystem mount");
    expect(mountCommand).toContain("--mountpoint /files");
    expect(mountCommand).toContain("--api-url 'https://api.example.test'");
    expect(mountCommand).toContain("/usr/bin/mountpoint -q /files");
    expect(mountCommand).toContain(
      "/usr/bin/chmod 700 /run/dust-filesystem/staging"
    );
  });

  it("fails closed when the image does not contain the daemon", async () => {
    const { auth, sandbox, execRoot, requestKill } = await setup();
    const adapter = new DatabaseSandboxMountAdapter(mounts, []);

    const result = await adapter.setup(
      auth,
      sandbox,
      SandboxImage.fromDocker("old-image")
    );

    expect(result.isErr()).toBe(true);
    expect(requestKill).toHaveBeenCalledOnce();
    expect(execRoot).not.toHaveBeenCalled();
  });

  it("rotates the token without restarting the mounted daemon", async () => {
    const { auth, sandbox, execRoot } = await setup();
    const adapter = new DatabaseSandboxMountAdapter(mounts, []);
    const image =
      SandboxImage.fromDocker("test").withCapability("dust_filesystem");

    const result = await adapter.refreshCredential(auth, sandbox, image);

    expect(result.isOk()).toBe(true);
    expect(execRoot).toHaveBeenCalledOnce();
    expect(commandAt(execRoot, 0)).not.toContain("filesystem mount");
  });
});
