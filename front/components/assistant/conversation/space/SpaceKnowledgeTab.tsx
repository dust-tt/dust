import { ProjectFileExplorer } from "@app/components/assistant/conversation/space/ProjectFileExplorer";
import type { RichSpaceType } from "@app/pages/api/w/[wId]/spaces/[spaceId]";

import type { WorkspaceType } from "@app/types/user";

interface SpaceKnowledgeTabProps {
  owner: WorkspaceType;
  space: RichSpaceType;
}

export function SpaceKnowledgeTab({ owner, space }: SpaceKnowledgeTabProps) {
  return <ProjectFileExplorer owner={owner} space={space} />;
}
