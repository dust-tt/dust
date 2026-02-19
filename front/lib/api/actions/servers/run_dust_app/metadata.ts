import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const RUN_DUST_APP_TOOL_NAME = "run_dust_app" as const;

/**
 * Tools metadata for run_dust_app server.
 *
 * This server is special because the actual tool is dynamically created based on
 * the Dust app configuration. The "run_dust_app" tool here is used for the
 * configuration flow where users select which Dust app to run.
 */
export const RUN_DUST_APP_TOOLS_METADATA = createToolsRecord({
  run_dust_app: {
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
  },
});

export const RUN_DUST_APP_SERVER = {
  serverInfo: {
    name: "run_dust_app" as const,
    version: "1.0.0",
    description: "Run Dust Apps with specified parameters.",
    icon: "CommandLineIcon" as const,
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(RUN_DUST_APP_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(RUN_DUST_APP_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
