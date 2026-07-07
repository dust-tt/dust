import type { SandboxOnlyMount } from "@app/lib/api/file_system/types";
import { getPodSandboxFunctionsMountPoint } from "@app/lib/api/files/mount_path";
import { POD_STATE_REPLICA_MOUNT_POINT } from "@app/lib/api/sandbox/pod_state";
import type { SpaceResource } from "@app/lib/resources/space_resource";

/**
 * The pod sandbox's sandbox-only mounts, shared by the bring-up path
 * (ensurePodSandboxReady) and the pre-sleep credential refresh
 * (PodSandboxAdapter) so both always operate on the same target set — the CAB
 * token covers every prefix of the sandbox at once.
 *
 * The parameter is `Pick<SpaceResource, "sId">` (only the sId is used) so the
 * wiring can be exercised in tests without constructing a full resource.
 */
type PodRef = Pick<SpaceResource, "sId">;

// A pod's published function bundles are mounted read-only so the sandbox can execute them while
// front stays the sole writer of bundles.
export function podSandboxFunctionsMount(pod: PodRef): SandboxOnlyMount {
  return {
    kind: "pod_sandbox_functions",
    id: pod.sId,
    sandboxMountPoint: getPodSandboxFunctionsMountPoint(pod.sId),
    readOnly: true,
  };
}

// The pod's litestream replica prefix, mounted dust-state-only (no
// allow_other) at /pod-state/replica. rw: the in-sandbox litestream daemon is
// the writer. Skipped by the mount adapter on images without the `pod_state`
// capability.
export function podStateReplicaMount(pod: PodRef): SandboxOnlyMount {
  return {
    kind: "pod_state",
    id: pod.sId,
    sandboxMountPoint: POD_STATE_REPLICA_MOUNT_POINT,
    readOnly: false,
  };
}

export function podSandboxOnlyMounts(pod: PodRef): SandboxOnlyMount[] {
  return [podSandboxFunctionsMount(pod), podStateReplicaMount(pod)];
}
