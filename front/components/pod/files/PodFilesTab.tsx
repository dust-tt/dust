import { PodFileExplorer } from "@app/components/pod/files/PodFileExplorer";
import type { PodType } from "@app/types/space";

import type { WorkspaceType } from "@app/types/user";

interface PodFilesTabProps {
  owner: WorkspaceType;
  pod: PodType;
}

export function PodFilesTab({ owner, pod }: PodFilesTabProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden px-6 py-8">
      <PodFileExplorer owner={owner} pod={pod} />
    </div>
  );
}
