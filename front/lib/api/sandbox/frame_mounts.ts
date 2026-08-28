import type { FileResource } from "@app/lib/resources/file_resource";
import type { SandboxOnlyMount } from "@app/types/file_system";
import { getFramePublicationsMountPoint } from "@app/types/mount_path";

type FrameRef = Pick<FileResource, "sId">;

export function frameSandboxOnlyMounts(frame: FrameRef): SandboxOnlyMount[] {
  return [
    {
      kind: "frame_publications",
      id: frame.sId,
      sandboxMountPoint: getFramePublicationsMountPoint(frame.sId),
      readOnly: true,
    },
  ];
}
