import type { FileResource } from "@app/lib/resources/file_resource";
import type { SandboxOnlyMount } from "@app/types/file_system";
import {
  getFramePersistentFilesMountPoint,
  getFramePublicationsMountPoint,
  SANDBOX_STATE_REPLICA_MOUNT_POINT,
} from "@app/types/mount_path";

type FrameRef = Pick<FileResource, "sId">;

/**
 * @cc [owner:pmilliotte,label:security] frame-persistent-files-content-is-untrusted
 * The `frame_persistent_files` mount is workload-writable and nothing validates what gets written,
 * so a file's name and extension say nothing about its bytes. Code that later serves a file from
 * this folder MUST pick the content type from a fixed allow-list rather than from the file, and
 * MUST NOT serve a type that can execute script in the Frame's origin (svg, html).
 */
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
    {
      kind: "frame_persistent_files",
      frameId: frame.sId,
      sandboxMountPoint: getFramePersistentFilesMountPoint(frame.sId),
      readOnly: false,
    },
  ];
}
