import { PROJECT_CONFIGURATION_URI_PATTERN } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { Err, Ok, type Result } from "@app/types/shared/result";

export function makePodConfigurationURI(
  workspaceId: string,
  podId: string
): string {
  return `pod://dust/w/${workspaceId}/pods/${podId}`;
}

export type PodConfigInfo = {
  workspaceId: string;
  podId: string;
};

export function parsePodConfigurationURI(
  uri: string
): Result<PodConfigInfo, Error> {
  const match = uri.match(PROJECT_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(new Error(`Invalid URI for a pod configuration: ${uri}`));
  }

  const [, workspaceId, podId] = match;

  return new Ok({
    workspaceId,
    podId,
  });
}
