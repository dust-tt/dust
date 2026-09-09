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

export function makeIndexAgentSearchWorkflowId({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): string {
  return `es-indexation-agent-search-${workspaceId}-${agentId}`;
}

export function makeDeleteWorkspaceAgentSearchWorkflowId({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `es-indexation-delete-workspace-agent-search-${workspaceId}`;
}
