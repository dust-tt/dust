import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { DustPodConfigurationSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { parsePodConfigurationURI } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isString } from "@app/types/shared/utils/general";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import { isResourceSId } from "../resources/string_ids";

/**
 * @cc [owner:achilleburah,label:security] approval-label-readable-pod-names
 * The inputs come from the model before the tool checks any permission, so the label names a Pod
 * only when the approving user can read it. Any other Pod shows its URI, the same as an unknown id.
 */
export async function getApprovalArgsLabel({
  auth,
  toolName,
  inputs,
  argumentsRequiringApproval,
}: {
  auth: Authenticator;
  internalMCPServerName: InternalMCPServerNameType | null | undefined;
  toolName: string;
  inputs: Record<string, unknown>;
  argumentsRequiringApproval: string[];
}): Promise<string | undefined> {
  for (const [inputName, inputValue] of Object.entries(inputs)) {
    if (!argumentsRequiringApproval.includes(inputName)) {
      continue;
    }

    // Check if the input is a Dust project configuration
    const parsed = DustPodConfigurationSchema.safeParse(inputValue);
    if (parsed.success) {
      const parsedProject = parsePodConfigurationURI(parsed.data.uri);
      if (parsedProject.isOk()) {
        const { workspaceId, podId: projectId } = parsedProject.value;
        if (workspaceId !== auth.getNonNullableWorkspace().sId) {
          return `Always allow agents to ${asDisplayName(toolName)} in Pod ${parsed.data.uri}`;
        }

        const space = await SpaceResource.fetchById(auth, projectId);
        const podLabel =
          space && auth.can("read", space) ? space.name : parsed.data.uri;
        return `Always allow agents to ${asDisplayName(toolName)} in "${podLabel}".`;
      }
    }

    // Check if the input is a file (a bit naive)
    if (
      inputName.toLowerCase().includes("fileid") &&
      isString(inputValue) &&
      isResourceSId("file", inputValue)
    ) {
      const file = await FileResource.fetchById(auth, inputValue);
      if (file) {
        return `Always allow agents to ${asDisplayName(toolName)} on file ${file?.fileName ?? inputValue}.`;
      }
    }
  }

  return undefined;
}
