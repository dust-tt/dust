import { getResourcePrefix, makeSId } from "@app/lib/resources/string_ids";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";

const RESOURCE_TYPES = [
  "file",
  "group",
  "space",
  "data_source",
  "data_source_view",
  "tracker",
  "template",
  "extension",
  "mcp_server_connection",
  "mcp_server_view",
  "trigger",
  "remote_mcp_server",
  "tag",
  "transcripts_configuration",
  "agent_step_content",
  "agent_memory",
  "mcp_action",
  "data_source_configuration",
  "table_configuration",
  "agent_configuration",
] as const;

makeScript(
  {
    resourceType: {
      type: "string",
      alias: "t",
      description: "Resource type to encode",
      required: true,
    },
    workspaceId: {
      type: "number",
      alias: "w",
      description: "Workspace model ID",
      required: true,
    },
    resourceId: {
      type: "number",
      alias: "r",
      description: "Resource model ID",
      required: true,
    },
  },
  async ({ resourceType, workspaceId, resourceId }, _logger) => {
    if (!RESOURCE_TYPES.includes(resourceType as any)) {
      const availableTypes = RESOURCE_TYPES.map(
        (type) => `  ${type} (${getResourcePrefix(type)})`
      ).join("\n");
      throw new Error(
        `Invalid resource type: ${resourceType}\nAvailable resource types:\n${availableTypes}`
      );
    }

    const workspaceModelId = workspaceId as ModelId;
    const resourceModelId = resourceId as ModelId;

    const sId = makeSId(resourceType as any, {
      id: resourceModelId,
      workspaceId: workspaceModelId,
    });

    console.log(`Resource Type: ${resourceType}`);
    console.log(`Workspace ID: ${workspaceModelId}`);
    console.log(`Resource ID: ${resourceModelId}`);
    console.log(`Generated sId: ${sId}`);
  }
);
