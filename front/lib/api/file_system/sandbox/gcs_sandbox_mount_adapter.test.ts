import { spawnSync } from "node:child_process";
import { GCSFileSystemBackend } from "@app/lib/api/file_system/backends/gcs_file_system_backend";
import type { GCSMountTarget } from "@app/lib/api/file_system/sandbox/gcs_sandbox_mount_adapter";
import {
  buildMountCommand,
  GCSSandboxMountAdapter,
} from "@app/lib/api/file_system/sandbox/gcs_sandbox_mount_adapter";
import { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import { podSandboxOnlyMounts } from "@app/lib/api/sandbox/pod_mounts";
import type { RootCommand } from "@app/lib/api/sandbox/root_command";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { setupPlainConversation } from "@app/tests/utils/conversation_test_factories";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const { mockMintDownscopedGcsToken } = vi.hoisted(() => ({
  mockMintDownscopedGcsToken: vi.fn(),
}));

vi.mock(import("@app/lib/api/sandbox/gcs/token"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    mintDownscopedGcsToken: mockMintDownscopedGcsToken,
  };
});

function workloadTarget(
  overrides: Partial<GCSMountTarget> = {}
): GCSMountTarget {
  return {
    gcsPrefix: "w/ws1/pods/spc1/files",
    sandboxMountPoint: "/files/pod-spc1",
    legacySandboxMountPoint: "/files/pod",
    readOnly: false,
    mountProfile: "workload",
    ...overrides,
  };
}

function successfulExec() {
  return new Ok({ exitCode: 0, stdout: "", stderr: "" });
}

async function createTestSandbox() {
  const { auth, conversation } = await setupPlainConversation();
  const sandbox = await SandboxFactory.create(auth, conversation.toJSON());
  const execRoot = vi
    .spyOn(sandbox, "execRoot")
    .mockResolvedValue(successfulExec());
  const requestKill = vi
    .spyOn(sandbox, "requestKill")
    .mockResolvedValue(undefined);

  return { auth, sandbox, execRoot, requestKill };
}

function createTestImage(): SandboxImage {
  return SandboxImage.fromDocker("test-image").withCapability("gcsfuse");
}

function getRootCommandCall(
  mock: { mock: { calls: unknown[][] } },
  callIndex: number
): string {
  return renderRootCommand(mock.mock.calls[callIndex][1] as RootCommand);
}

function createPodSandboxAdapter(): GCSSandboxMountAdapter {
  const backend = new GCSFileSystemBackend("ws1", "test-private-uploads");
  const adapter = backend.createSandboxAdapter(
    [
      {
        kind: "pod",
        id: "spc1",
        scopedPrefix: "pod-spc1",
        sandboxMountPoint: "/files/pod-spc1",
        legacyPrefix: "project",
        legacySandboxMountPoint: "/files/pod",
        permissions: { canRead: true, canWrite: true },
      },
    ],
    podSandboxOnlyMounts({ sId: "spc1" })
  );

  if (!(adapter instanceof GCSSandboxMountAdapter)) {
    throw new Error("expected a GCSSandboxMountAdapter");
  }

  return adapter;
}

describe("buildMountCommand", () => {
  test("workload profile disables caches for shared mutable files", () => {
    const command = renderRootCommand(
      buildMountCommand({ bucket: "bucket-x", target: workloadTarget() })
    );

    expect(command).toContain("/usr/bin/gcsfuse");
    expect(command).toContain("--token-url http://127.0.0.1:987/token/mount-0");
    expect(command).not.toContain("runuser");
    expect(command).toContain("-o allow_other");
    expect(command).toContain("--file-mode=666");
    expect(command).toContain("--dir-mode=777");
    expect(command).toContain("--kernel-list-cache-ttl-secs=0");
    expect(command).toContain("--metadata-cache-ttl-secs=0");
    expect(command).toContain("--metadata-cache-negative-ttl-secs=0");
    expect(command).toContain("--only-dir w/ws1/pods/spc1/files");
    expect(command).toContain("--enable-hns=false");
    expect(command).toContain("bucket-x /files/pod-spc1");
  });

  test("pod function profile disables caches for newly published functions", () => {
    const command = renderRootCommand(
      buildMountCommand({
        bucket: "bucket-x",
        targetIndex: 1,
        target: workloadTarget({
          gcsPrefix: "w/ws1/pods/spc1/sandbox-functions",
          sandboxMountPoint: "/sandbox-functions/pods/spc1",
          legacySandboxMountPoint: null,
          readOnly: true,
          mountProfile: "pod_sandbox_functions",
        }),
      })
    );

    expect(command).toContain("-o allow_other,ro");
    expect(command).toContain("--kernel-list-cache-ttl-secs=0");
    expect(command).toContain("--metadata-cache-ttl-secs=0");
    expect(command).toContain("--metadata-cache-negative-ttl-secs=0");
    expect(command).toContain("--token-url http://127.0.0.1:987/token/mount-1");
  });

  test("pod_state_replica profile mounts as dust-state without allow_other or list caching", () => {
    const command = renderRootCommand(
      buildMountCommand({
        bucket: "bucket-x",
        target: {
          gcsPrefix: "w/ws1/pods/spc1/state",
          sandboxMountPoint: "/pod-state/replica",
          legacySandboxMountPoint: null,
          readOnly: false,
          mountProfile: "pod_state_replica",
        },
      })
    );

    // Mounted as dust-state: FUSE denies every other uid without allow_other,
    // which is what keeps the replica invisible to the workload uid 1003.
    expect(command).toContain(
      "/usr/sbin/runuser -u dust-state -- /usr/bin/gcsfuse"
    );
    expect(command).not.toContain("allow_other");
    // Restore must never see a cached LTX listing.
    expect(command).toContain("--kernel-list-cache-ttl-secs=0");
    expect(command).toContain("--metadata-cache-ttl-secs=0");
    expect(command).toContain("--metadata-cache-negative-ttl-secs=0");
    expect(command).toContain("--file-mode=600");
    expect(command).toContain("--dir-mode=700");
    expect(command).toContain("--only-dir w/ws1/pods/spc1/state");
    expect(command).toContain("--enable-hns=false");
    expect(command).toContain("bucket-x /pod-state/replica");
  });
});

describe("pod sandbox mount wiring", () => {
  beforeAll(() => {
    // Config reads used by createSandboxAdapter/getAccessBoundaryRules.
    process.env.GOOGLE_CLOUD_PROJECT_ID ??= "test-project";
    process.env.DUST_PRIVATE_UPLOADS_BUCKET ??= "test-private-uploads";
  });

  test("the real pod mount set produces the full 7-rule CAB grant including the state prefix", () => {
    // Derived from the ACTUAL wiring (podSandboxOnlyMounts + the backend's
    // prefix mapping) rather than hand-built prefixes, so dropping the state
    // mount from the pod set — or regressing its prefix string — fails here.
    const adapter = createPodSandboxAdapter();

    // Each mount gets its own 1 + 2-rule CAB. The firewall is the sole caller
    // authorization boundary; if a caller reaches the broker, each token still
    // grants only its own target prefix.
    const rules = adapter.getAccessBoundaryRules();
    expect(rules).toHaveLength(3);
    expect(rules.every((tokenRules) => tokenRules.length === 3)).toBe(true);

    const conditions = rules
      .flat()
      .map((rule) =>
        "availabilityCondition" in rule
          ? rule.availabilityCondition.expression
          : ""
      )
      .join("\n");
    expect(conditions).toContain("w/ws1/pods/spc1/files/");
    expect(conditions).toContain("w/ws1/pods/spc1/sandbox-functions/");
    expect(conditions).toContain("w/ws1/pods/spc1/state/");
  });

  test("the real pod function mount disables directory list caching", async () => {
    vi.clearAllMocks();
    mockMintDownscopedGcsToken.mockResolvedValue(
      new Ok({ accessToken: "token", expiresInSeconds: 3600 })
    );
    const adapter = createPodSandboxAdapter();
    const { auth, sandbox, execRoot } = await createTestSandbox();
    const image = createTestImage();

    const result = await adapter.setup(auth, sandbox, image);

    expect(result.isOk()).toBe(true);
    const commands = execRoot.mock.calls.map((_, callIndex) =>
      getRootCommandCall(execRoot, callIndex)
    );
    const podFilesCommand = commands.find(
      (command) =>
        command.includes("/usr/bin/gcsfuse") &&
        command.includes("/files/pod-spc1")
    );
    const podFunctionsCommand = commands.find(
      (command) =>
        command.includes("/usr/bin/gcsfuse") &&
        command.includes("/sandbox-functions/pods/spc1")
    );

    expect(podFilesCommand).toContain("--kernel-list-cache-ttl-secs=0");
    expect(podFilesCommand).toContain("--metadata-cache-ttl-secs=0");
    expect(podFilesCommand).toContain("--metadata-cache-negative-ttl-secs=0");
    expect(podFunctionsCommand).toContain("--kernel-list-cache-ttl-secs=0");
    expect(podFunctionsCommand).toContain("--metadata-cache-ttl-secs=0");
    expect(podFunctionsCommand).toContain(
      "--metadata-cache-negative-ttl-secs=0"
    );
  });
});

describe("GCS credential lifecycle", () => {
  const image = createTestImage();

  beforeEach(() => {
    vi.clearAllMocks();
    mockMintDownscopedGcsToken.mockResolvedValue(
      new Ok({ accessToken: "token", expiresInSeconds: 3600 })
    );
  });

  test("starts the broker only after firewall setup and fail-closes the deny-check", async () => {
    const { auth, sandbox, execRoot } = await createTestSandbox();
    const adapter = new GCSSandboxMountAdapter("bucket-x", [workloadTarget()]);

    const result = await adapter.setup(auth, sandbox, image);

    expect(result.isOk()).toBe(true);
    const command = getRootCommandCall(execRoot, 1);
    expect(command).toContain(
      "/usr/local/bin/dust-gcs-token-firewall.sh; firewall_exit=$?"
    );
    expect(command).toContain("/usr/sbin/runuser -u agent -- /usr/bin/curl");
    expect(command).toContain(
      "/usr/sbin/runuser -u agent-proxied -- /usr/bin/curl"
    );
    expect(command).toContain("--connect-timeout 0.3 --max-time 1");
    expect(command).toContain("deny_check_exit -ne 28");
    expect(command.indexOf("exit $firewall_exit")).toBeLessThan(
      command.indexOf("i=0; while")
    );
    expect(spawnSync("/bin/bash", ["-n", "-c", command]).status).toBe(0);
  });

  test("surfaces a firewall startup failure without polling the broker", async () => {
    const { auth, sandbox, execRoot } = await createTestSandbox();
    execRoot
      .mockReset()
      .mockResolvedValueOnce(successfulExec())
      .mockResolvedValueOnce(
        new Ok({
          exitCode: 1,
          stdout: "",
          stderr: "GCS token firewall setup failed (exit code 1)",
        })
      );
    const adapter = new GCSSandboxMountAdapter("bucket-x", [workloadTarget()]);

    const result = await adapter.setup(auth, sandbox, image);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("expected broker startup to fail");
    }
    expect(result.error.message).toContain(
      "GCS token firewall setup failed (exit code 1)"
    );
    expect(result.error.message).not.toContain("not ready in time");
    expect(execRoot).toHaveBeenCalledTimes(2);
  });

  test("refreshes the broker firewall before writing tokens", async () => {
    const { auth, sandbox, execRoot, requestKill } = await createTestSandbox();
    const adapter = new GCSSandboxMountAdapter("bucket-x", [workloadTarget()]);

    const result = await adapter.refreshCredential(auth, sandbox, image);

    expect(result.isOk()).toBe(true);
    expect(execRoot).toHaveBeenCalledTimes(2);
    const firewallCommand = getRootCommandCall(execRoot, 0);
    expect(firewallCommand).toBe("/usr/local/bin/dust-gcs-token-firewall.sh");
    expect(requestKill).not.toHaveBeenCalled();
  });

  test("requests recreation when the image firewall helper is unavailable", async () => {
    const { auth, sandbox, execRoot, requestKill } = await createTestSandbox();
    execRoot.mockReset().mockResolvedValue(
      new Ok({
        exitCode: 127,
        stdout: "",
        stderr: "helper not found",
      })
    );
    const adapter = new GCSSandboxMountAdapter("bucket-x", [workloadTarget()]);

    const result = await adapter.refreshCredential(auth, sandbox, image);

    expect(result.isErr()).toBe(true);
    expect(execRoot).toHaveBeenCalledTimes(1);
    expect(mockMintDownscopedGcsToken).not.toHaveBeenCalled();
    expect(requestKill).toHaveBeenCalledTimes(1);
  });

  test("does not recreate a sandbox after a transient firewall exec error", async () => {
    const { auth, sandbox, execRoot, requestKill } = await createTestSandbox();
    execRoot
      .mockReset()
      .mockResolvedValue(new Err(new Error("transient E2B error")));
    const adapter = new GCSSandboxMountAdapter("bucket-x", [workloadTarget()]);

    const result = await adapter.refreshCredential(auth, sandbox, image);

    expect(result.isErr()).toBe(true);
    expect(mockMintDownscopedGcsToken).not.toHaveBeenCalled();
    expect(requestKill).not.toHaveBeenCalled();
  });
});
