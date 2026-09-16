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
    // Litestream's replica destination, not the databases themselves: it holds LTX chains under
    // one directory per database and has to be `litestream restore`d to be readable. The live
    // `.db` files are on local disk at SANDBOX_STATE_DATABASES_DIR.
    {
      kind: "frame_database_replicas",
      frameId: frame.sId,
      sandboxMountPoint: SANDBOX_STATE_REPLICA_MOUNT_POINT,
      readOnly: false,
    },
  ];
}
