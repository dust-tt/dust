import { SKILL_SEARCH_ALIAS_NAME } from "@app/lib/api/elasticsearch";
import { ResourceSearchIndex } from "@app/lib/search/resource_search_index";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

export const skillSearchIndex = new ResourceSearchIndex<SkillSearchDocument>(
  SKILL_SEARCH_ALIAS_NAME,
  "skill_id"
);

export function indexSkillDocument(document: SkillSearchDocument) {
  return skillSearchIndex.upsert(document);
}
export function deleteSkillDocument({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}) {
  return skillSearchIndex.delete({ workspaceId, resourceId: skillId });
}
export function deleteWorkspaceSkillDocuments({
  workspaceId,
}: {
  workspaceId: string;
}) {
  return skillSearchIndex.deleteWorkspace({ workspaceId });
}
export function updateSkillSearchActiveUsers({
  workspaceId,
  skillIds,
  activeUsers,
}: {
  workspaceId: string;
  skillIds: string[];
  activeUsers: Record<string, number>;
}) {
  return skillSearchIndex.updateActiveUsers({
    workspaceId,
    resourceIds: skillIds,
    activeUsers,
  });
}
