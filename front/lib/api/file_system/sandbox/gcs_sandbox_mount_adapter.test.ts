import { GCSFileSystemBackend } from "@app/lib/api/file_system/backends/gcs_file_system_backend";
import {
  buildMountCommand,
  type GCSMountTarget,
  GCSSandboxMountAdapter,
} from "@app/lib/api/file_system/sandbox/gcs_sandbox_mount_adapter";
import { podSandboxOnlyMounts } from "@app/lib/api/sandbox/pod_mounts";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { beforeAll, describe, expect, test } from "vitest";

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

describe("buildMountCommand", () => {
  test("workload profile mounts as root with allow_other and permissive modes", () => {
    const command = renderRootCommand(
      buildMountCommand({ bucket: "bucket-x", target: workloadTarget() })
    );

    expect(command).toContain("/usr/bin/gcsfuse");
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
        target: workloadTarget({
          gcsPrefix: "w/ws1/pods/spc1/sandbox-functions",
          sandboxMountPoint: "/sandbox-functions/pods/spc1",
          legacySandboxMountPoint: null,
          readOnly: true,
        }),
      })
    );

    expect(command).toContain("-o allow_other,ro");
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

    // 1 unconditional bucket-get rule + 2 rules per prefix × 3 prefixes
    // (files rw, sandbox-functions ro, state rw) = 7, under the 10-rule CAB
    // ceiling.
    const rules = adapter.getAccessBoundaryRules();
    expect(rules).toHaveLength(7);

    const conditions = rules
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
