import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const POKE_SERVER_NAME = "poke" as const;
export const GET_WORKSPACE_METADATA_TOOL_NAME = "get_workspace_metadata";

export const POKE_TOOLS_METADATA = createToolsRecord({
  [GET_WORKSPACE_METADATA_TOOL_NAME]: {
    description:
      "Fetch metadata for a target Dust workspace. Requires Dust super user privileges.",
    schema: {
      workspace_id: z
        .string()
        .describe("The sId of the target workspace to fetch metadata for."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching workspace metadata",
      done: "Fetched workspace metadata",
    },
  },
});

export const POKE_SERVER = {
  serverInfo: {
    name: POKE_SERVER_NAME,
    version: "1.0.0",
    description:
      "Dust-internal tools for cross-workspace data access (poke). Requires super user privileges.",
    authorization: null,
    icon: "ActionLightbulbIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(POKE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(POKE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
