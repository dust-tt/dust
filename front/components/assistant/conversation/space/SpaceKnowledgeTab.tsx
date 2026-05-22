import { ProjectFileExplorer } from "@app/components/assistant/conversation/space/ProjectFileExplorer";
import type { RichSpaceType } from "@app/pages/api/w/[wId]/spaces/[spaceId]";

import type { WorkspaceType } from "@app/types/user";

interface SpaceKnowledgeTabProps {
  owner: WorkspaceType;
  space: RichSpaceType;
}

export function SpaceKnowledgeTab({ owner, space }: SpaceKnowledgeTabProps) {
  return (
    <div className="flex  py-8">
      <ProjectFileExplorer owner={owner} space={space} />
    </div>
  );
}
