import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolType } from "@app/lib/api/mcp";

export const runDustAppSchema = {
  dustApp:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP],
};

// Note: The actual tool name and schema are dynamic based on the Dust app
// configuration, but this provides a representative definition for static
// metadata discovery.

export const RUN_DUST_APP_TOOLS: MCPToolType[] = [
  {
    name: "run_dust_app",
    description: "Run a Dust App with specified parameters.",
    inputSchema: zodToJsonSchema(z.object(runDustAppSchema)) as JSONSchema,
  },
];

export const RUN_DUST_APP_SERVER_INFO = {
  name: "run_dust_app" as const,
  version: "1.0.0",
  description: "Run Dust Apps with specified parameters.",
  authorization: null,
  icon: "CommandLineIcon" as const,
  documentationUrl: null,
  instructions: null,
};
