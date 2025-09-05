import { makeSId, getResourcePrefix } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types";
import { makeScript } from "./helpers";

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
  "remote_mcp_server",
  "tag",
  "transcripts_configuration",
  "agent_step_content",
  "agent_memory",
  "trigger",
  "webhook_source",
  "mcp_action",
  "data_source_configuration",
  "table_configuration",
  "agent_configuration",
] as const;

makeScript(
  {
    resourceType: {
      alias: "t",
      describe: `Resource type (${RESOURCE_TYPES.join(", ")})`,
      type: "string" as const,
      demandOption: true,
      choices: RESOURCE_TYPES,
    },
    workspaceId: {
      alias: "w", 
      describe: "Workspace ID (numeric)",
      type: "number" as const,
      demandOption: true,
    },
    modelId: {
      alias: "m",
      describe: "Model ID (numeric)", 
      type: "number" as const,
      demandOption: true,
    },
  },
  async (args, logger) => {
    const { resourceType, workspaceId, modelId } = args;

    try {
      const sId = makeSId(resourceType as any, {
        id: modelId as ModelId,
        workspaceId: workspaceId as ModelId,
      });

      const prefix = getResourcePrefix(resourceType as any);
      
      logger.info(`Generated SID: ${sId}`);
      logger.info(`Resource type: ${resourceType} (prefix: ${prefix})`);
      logger.info(`Workspace ID: ${workspaceId}`);
      logger.info(`Model ID: ${modelId}`);
      
      console.log(sId);
    } catch (error) {
      logger.error({ error }, "Failed to generate SID");
      process.exit(1);
    }
  }
);