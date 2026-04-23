import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { DustProjectConfigurationSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { parseProjectConfigurationURI } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isString } from "@app/types/shared/utils/general";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import { isResourceSId } from "../resources/string_ids";

export async function getApprovalArgsLabel({
  auth,
  toolName,
  agentName,
  inputs,
  argumentsRequiringApproval,
}: {
  auth: Authenticator;
  internalMCPServerName: InternalMCPServerNameType | null | undefined;
  toolName: string;
  agentName: string;
  inputs: Record<string, unknown>;
  argumentsRequiringApproval: string[];
}): Promise<string | undefined> {
  for (const [inputName, inputValue] of Object.entries(inputs)) {
    if (!argumentsRequiringApproval.includes(inputName)) {
      continue;
    }

    // Check if the input is a Dust project configuration
    const parsed = DustProjectConfigurationSchema.safeParse(inputValue);
    if (parsed.success) {
      const parsedProject = parseProjectConfigurationURI(parsed.data.uri);
      if (parsedProject.isOk()) {
        const { workspaceId, projectId } = parsedProject.value;
        if (workspaceId !== auth.getNonNullableWorkspace().sId) {
          return `Always allow @${agentName} to ${asDisplayName(toolName)} in project ${parsed.data.uri}`;
        }

        const space = await SpaceResource.fetchById(auth, projectId);
        return `Always allow @${agentName} to ${asDisplayName(toolName)} in "${space?.name ?? parsed.data.uri}".`;
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
        return `Always allow @${agentName} to ${asDisplayName(toolName)} for file ${file?.fileName ?? inputValue}.`;
      }
    }
  }

  return undefined;
}
