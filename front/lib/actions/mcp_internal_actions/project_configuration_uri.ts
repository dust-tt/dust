import { PROJECT_CONFIGURATION_URI_PATTERN } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { Err, Ok, type Result } from "@app/types/shared/result";

export function makeProjectConfigurationURI(
  workspaceId: string,
  projectId: string
): string {
  return `project://dust/w/${workspaceId}/projects/${projectId}`;
}

export type ProjectConfigInfo = {
  workspaceId: string;
  projectId: string;
};

export function parseProjectConfigurationURI(
  uri: string
): Result<ProjectConfigInfo, Error> {
  const match = uri.match(PROJECT_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(new Error(`Invalid URI for a pod configuration: ${uri}`));
  }

  const [, workspaceId, projectId] = match;

  return new Ok({
    workspaceId,
    projectId,
  });
}
