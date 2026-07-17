import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  InternalMCPToolType,
  ServerMetadata,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

/**
 * Tools metadata for run_dust_app server.
 *
 * This server is special because the actual tool is dynamically created based on
 * the Dust app configuration. The "run_dust_app" tool here is used for the
 * configuration flow where users select which Dust app to run.
 */
export const RUN_DUST_APP_TOOLS_METADATA = [
  {
    name: "run_dust_app",
    description: "Run a Dust App with specified parameters.",
    schema: {
      dustApp:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP],
    },
    stake: "never_ask",
    displayLabels: {
      running: "Running Dust app",
      done: "Run Dust app",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
] as const satisfies readonly InternalMCPToolType[];

export const RUN_DUST_APP_SERVER = {
  serverInfo: {
    name: "run_dust_app" as const,
    version: "1.0.0",
    description: "Run Dust Apps with specified parameters.",
    icon: "CommandLineIcon" as const,
    authorization: null,
    documentationUrl: null,
  },
  tools: RUN_DUST_APP_TOOLS_METADATA,
} as const satisfies ServerMetadata;
