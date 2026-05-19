import { ProjectFileExplorer } from "@app/components/assistant/conversation/space/ProjectFileExplorer";
import type { ProjectType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";

interface SpaceKnowledgeTabProps {
  owner: WorkspaceType;
  space: ProjectType;
}

export function SpaceKnowledgeTab({ owner, space }: SpaceKnowledgeTabProps) {
  return <ProjectFileExplorer owner={owner} space={space} />;
}
