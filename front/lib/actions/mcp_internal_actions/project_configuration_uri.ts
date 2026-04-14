export function makeProjectConfigurationURI(
  workspaceId: string,
  projectId: string
): string {
  return `project://dust/w/${workspaceId}/projects/${projectId}`;
}
