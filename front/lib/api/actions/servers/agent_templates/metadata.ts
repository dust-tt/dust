import type {
  InternalMCPToolType,
  ServerMetadata,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const AGENT_TEMPLATES_SERVER_NAME = "agent_templates" as const;

export const AGENT_TEMPLATES_TOOLS_METADATA = [
  {
    name: "search_agent_templates",
    description:
      "Search published agent templates. Use jobType for tag-based filtering or query for semantic search. Returns template details including instructions.",
    schema: {
      jobType: z
        .string()
        .optional()
        .describe(
          "User's job type to filter templates by relevant tags (e.g. 'sales', 'engineering', 'legal'). If omitted, returns all published templates."
        ),
      query: z
        .string()
        .optional()
        .describe(
          "Free-text query to semantically search templates. Use when the user describes a specific use case not covered by jobType tags."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching templates",
      done: "Search templates",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "get_agent_template",
    description:
      "Fetch the full details of an agent template by id, including its instructions and guidance.",
    schema: {
      templateId: z.string().describe("The sId of the template to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching template",
      done: "Fetch template",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const AGENT_TEMPLATES_SERVER = {
  serverInfo: {
    name: AGENT_TEMPLATES_SERVER_NAME,
    version: "1.0.0",
    description: "Search and retrieve agent templates.",
    authorization: null,
    icon: "ActionDocumentTextIcon",
    documentationUrl: null,
  },
  tools: AGENT_TEMPLATES_TOOLS_METADATA,
} as const satisfies ServerMetadata;
