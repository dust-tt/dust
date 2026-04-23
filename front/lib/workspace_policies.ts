import type { LightWorkspaceType } from "@app/types/user";

export function areOpenProjectsAllowed(owner: LightWorkspaceType): boolean {
  return owner.metadata?.allowOpenProjects !== false;
}
