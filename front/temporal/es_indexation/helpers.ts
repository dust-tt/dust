export function makeIndexUserSearchWorkflowId({
  userId,
}: {
  userId: string;
}): string {
  return `es-indexation-user-search-${userId}`;
}

export function makeIndexSkillSearchWorkflowId({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): string {
  return `es-indexation-skill-search-${workspaceId}-${skillId}`;
}

export function makeDeleteWorkspaceSkillSearchWorkflowId({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `es-indexation-delete-workspace-skill-search-${workspaceId}`;
}
