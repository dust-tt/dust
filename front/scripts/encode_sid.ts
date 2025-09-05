import { getResourcePrefix, makeSId } from "@app/lib/resources/string_ids";
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

function main() {
  const [resourceType, workspaceId, resourceId] = process.argv.slice(2);

  if (!resourceType || !workspaceId || !resourceId) {
    console.error(
      "Usage: ts-node encode_sid.ts <resourceType> <workspaceId> <resourceId>"
    );
    console.error("Available resource types:");
    RESOURCE_TYPES.forEach((type) =>
      console.error(`  ${type} (${getResourcePrefix(type)})`)
    );
    process.exit(1);
  }

  if (!RESOURCE_TYPES.includes(resourceType as any)) {
    console.error(`Invalid resource type: ${resourceType}`);
    console.error("Available resource types:");
    RESOURCE_TYPES.forEach((type) =>
      console.error(`  ${type} (${getResourcePrefix(type)})`)
    );
    process.exit(1);
  }

  const workspaceModelId = parseInt(workspaceId) as ModelId;
  const resourceModelId = parseInt(resourceId) as ModelId;

  if (isNaN(workspaceModelId) || isNaN(resourceModelId)) {
    console.error("Workspace ID and Resource ID must be valid numbers");
    process.exit(1);
  }

  const sId = makeSId(resourceType as any, {
    id: resourceModelId,
    workspaceId: workspaceModelId,
  });

  console.log(`Resource Type: ${resourceType}`);
  console.log(`Workspace ID: ${workspaceModelId}`);
  console.log(`Resource ID: ${resourceModelId}`);
  console.log(`Generated sId: ${sId}`);
}

main();
