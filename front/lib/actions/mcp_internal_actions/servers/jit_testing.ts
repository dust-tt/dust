import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";

function createServer(): McpServer {
  const server = makeInternalMCPServer("jit_testing");

  server.tool(
    "jit_all_optionals_and_defaults",
    "A single tool aggregating optional/default configs for TIME_FRAME, JSON_SCHEMA, DATA_SOURCE, and AGENT for JIT testing.",
    {
      // TIME_FRAME: default and optional variants
      timeFrameDefault: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
      ]
        .describe("TIME_FRAME with default value")
        .default({
          duration: 7,
          unit: "day",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME,
        }),
      timeFrameOptional: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
      ]
        .describe("Optional TIME_FRAME")
        .optional(),

      // JSON_SCHEMA: default and optional variants
      jsonSchemaDefault: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA
      ]
        .describe("JSON_SCHEMA with default value")
        .default({
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA,
        }),
      jsonSchemaOptional: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA
      ]
        .describe("Optional JSON_SCHEMA")
        .optional(),

      // DATA_SOURCE: optional
      dataSourceOptional: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
      ]
        .describe("Optional DATA_SOURCE list")
        .optional(),

      // AGENT: optional
      agentOptional: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT
      ]
        .describe("Optional child agent")
        .optional(),

      note: z.string().describe("Optional note for debugging").optional(),
    },
    async (params) => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `JIT testing tool received: ${JSON.stringify(params)}`,
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;
