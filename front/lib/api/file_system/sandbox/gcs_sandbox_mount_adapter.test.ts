import { spawnSync } from "node:child_process";
import { GCSFileSystemBackend } from "@app/lib/api/file_system/backends/gcs_file_system_backend";
import {
  buildMountCommand,
  type GCSMountTarget,
  GCSSandboxMountAdapter,
} from "@app/lib/api/file_system/sandbox/gcs_sandbox_mount_adapter";
import { podSandboxOnlyMounts } from "@app/lib/api/sandbox/pod_mounts";
import {
  type RootCommand,
  renderRootCommand,
} from "@app/lib/api/sandbox/root_command";
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

function getRootCommandCall(
  mock: { mock: { calls: unknown[][] } },
  callIndex: number
): string {
  return renderRootCommand(mock.mock.calls[callIndex][1] as RootCommand);
}

describe("buildMountCommand", () => {
  test("workload profile mounts as root with allow_other and permissive modes", () => {
    const command = renderRootCommand(
      buildMountCommand({ bucket: "bucket-x", target: workloadTarget() })
    );

    expect(command).toContain("/usr/bin/gcsfuse");
    expect(command).toContain("--token-url http://127.0.0.1:987/token/mount-0");
    expect(command).not.toContain("runuser");
    expect(command).toContain("-o allow_other");
    expect(command).toContain("--file-mode=666");
    expect(command).toContain("--dir-mode=777");
    expect(command).toContain("--kernel-list-cache-ttl-secs=60");
    expect(command).toContain("--only-dir w/ws1/pods/spc1/files");
    expect(command).toContain("--enable-hns=false");
    expect(command).toContain("bucket-x /files/pod-spc1");
  });

  test("workload profile adds ro for read-only targets", () => {
    const command = renderRootCommand(
      buildMountCommand({
        bucket: "bucket-x",
        targetIndex: 1,
        target: workloadTarget({
          gcsPrefix: "w/ws1/pods/spc1/sandbox-functions",
          sandboxMountPoint: "/sandbox-functions/pods/spc1",
          legacySandboxMountPoint: null,
          readOnly: true,
        }),
      })
    );

    expect(command).toContain("-o allow_other,ro");
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
});

describe("GCS credential lifecycle", () => {
  const auth = {
    getNonNullableWorkspace: () => ({ sId: "workspace-id" }),
  } as never;
  const image = {
    hasCapability: (capability: string) => capability === "gcsfuse",
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMintDownscopedGcsToken.mockResolvedValue(
      new Ok({ accessToken: "token", expiresInSeconds: 3600 })
    );
  });

  test("starts the broker only after firewall setup and fail-closes the deny-check", async () => {
    const sandbox = {
      sId: "sandbox-id",
      execRoot: vi.fn().mockResolvedValue(successfulExec()),
      requestKill: vi.fn(),
    };
    const adapter = new GCSSandboxMountAdapter("bucket-x", [workloadTarget()]);

    const result = await adapter.setup(auth, sandbox as never, image);

    expect(result.isOk()).toBe(true);
    const command = getRootCommandCall(sandbox.execRoot, 1);
    expect(command).toContain(
      "/usr/local/bin/dust-gcs-token-firewall.sh; firewall_exit=$?"
    );
    expect(command).toContain("--connect-timeout 0.3 --max-time 1");
    expect(command).toContain("deny_check_exit -ne 28");
    expect(command.indexOf("exit $firewall_exit")).toBeLessThan(
      command.indexOf("i=0; while")
    );
    expect(spawnSync("/bin/bash", ["-n", "-c", command]).status).toBe(0);
  });

  test("surfaces a firewall startup failure without polling the broker", async () => {
    const sandbox = {
      sId: "sandbox-id",
      execRoot: vi
        .fn()
        .mockResolvedValueOnce(successfulExec())
        .mockResolvedValueOnce(
          new Ok({
            exitCode: 1,
            stdout: "",
            stderr: "GCS token firewall setup failed (exit code 1)",
          })
        ),
      requestKill: vi.fn(),
    };
    const adapter = new GCSSandboxMountAdapter("bucket-x", [workloadTarget()]);

    const result = await adapter.setup(auth, sandbox as never, image);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("expected broker startup to fail");
    }
    expect(result.error.message).toContain(
      "GCS token firewall setup failed (exit code 1)"
    );
    expect(result.error.message).not.toContain("not ready in time");
    expect(sandbox.execRoot).toHaveBeenCalledTimes(2);
  });

  test("refreshes both firewall generations in one root exec", async () => {
    const sandbox = {
      sId: "sandbox-id",
      exec: vi.fn(),
      execRoot: vi.fn().mockResolvedValue(successfulExec()),
      requestKill: vi.fn(),
    };
    const adapter = new GCSSandboxMountAdapter("bucket-x", [workloadTarget()]);

    const result = await adapter.refreshCredential(
      auth,
      sandbox as never,
      image
    );

    expect(result.isOk()).toBe(true);
    expect(sandbox.execRoot).toHaveBeenCalledTimes(2);
    const firewallCommand = getRootCommandCall(sandbox.execRoot, 0);
    expect(firewallCommand).toContain("dust-gcs-token-legacy");
    expect(firewallCommand).toContain(
      "/usr/local/bin/dust-gcs-token-firewall.sh"
    );
    expect(spawnSync("/bin/bash", ["-n", "-c", firewallCommand]).status).toBe(
      0
    );
    expect(sandbox.exec).not.toHaveBeenCalled();
    expect(sandbox.requestKill).not.toHaveBeenCalled();
  });

  test("refreshes the legacy token before recreating an old-image sandbox", async () => {
    const sandbox = {
      sId: "sandbox-id",
      exec: vi.fn().mockResolvedValue(successfulExec()),
      execRoot: vi.fn().mockResolvedValue(
        new Ok({
          exitCode: 127,
          stdout: "",
          stderr: "dust-gcs-current-firewall-failed",
        })
      ),
      requestKill: vi.fn().mockResolvedValue(undefined),
    };
    const targets = [
      workloadTarget(),
      workloadTarget({
        gcsPrefix: "w/ws1/pods/spc1/state",
        sandboxMountPoint: "/pod-state/replica",
        legacySandboxMountPoint: null,
        mountProfile: "pod_state_replica",
      }),
    ];
    const adapter = new GCSSandboxMountAdapter("bucket-x", targets);

    const result = await adapter.refreshCredential(
      auth,
      sandbox as never,
      image
    );

    expect(result.isOk()).toBe(true);
    expect(sandbox.execRoot).toHaveBeenCalledTimes(1);
    expect(mockMintDownscopedGcsToken).toHaveBeenCalledWith({
      bucket: "bucket-x",
      prefixes: targets.map((target) => ({
        prefix: target.gcsPrefix,
        readOnly: target.readOnly,
      })),
    });
    expect(sandbox.exec).toHaveBeenCalledWith(
      auth,
      "/usr/bin/tee /tmp/token.json >/dev/null",
      {
        stdin: JSON.stringify({
          access_token: "token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      }
    );
    expect(sandbox.requestKill).toHaveBeenCalledTimes(1);
  });

  test("does not recreate a sandbox after a transient firewall exec error", async () => {
    const sandbox = {
      sId: "sandbox-id",
      exec: vi.fn(),
      execRoot: vi
        .fn()
        .mockResolvedValue(new Err(new Error("transient E2B error"))),
      requestKill: vi.fn(),
    };
    const adapter = new GCSSandboxMountAdapter("bucket-x", [workloadTarget()]);

    const result = await adapter.refreshCredential(
      auth,
      sandbox as never,
      image
    );

    expect(result.isErr()).toBe(true);
    expect(mockMintDownscopedGcsToken).not.toHaveBeenCalled();
    expect(sandbox.exec).not.toHaveBeenCalled();
    expect(sandbox.requestKill).not.toHaveBeenCalled();
  });
});
