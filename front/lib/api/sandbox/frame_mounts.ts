import type { FileResource } from "@app/lib/resources/file_resource";
import type { SandboxOnlyMount } from "@app/types/file_system";
import {
  getFramePublicationsMountPoint,
  SANDBOX_STATE_REPLICA_MOUNT_POINT,
} from "@app/types/mount_path";

type FrameRef = Pick<FileResource, "sId">;

export function frameSandboxOnlyMounts(frame: FrameRef): SandboxOnlyMount[] {
  return [
    {
      kind: "frame_publications",
      frameId: frame.sId,
      sandboxMountPoint: getFramePublicationsMountPoint(frame.sId),
      readOnly: true,
    },
    {
      kind: "frame_state",
      frameId: frame.sId,
      sandboxMountPoint: SANDBOX_STATE_REPLICA_MOUNT_POINT,
      readOnly: false,
    },
  ];
}
