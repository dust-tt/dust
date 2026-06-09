import type { LightWorkspaceType } from "@app/types/user";

export function areOpenPodsAllowed(owner: LightWorkspaceType): boolean {
  return owner.metadata?.allowOpenProjects !== false;
}

export function isManualPodFilesManagementAllowed(
  owner: LightWorkspaceType
): boolean {
  return owner.metadata?.allowManualProjectKnowledgeManagement !== false;
}
