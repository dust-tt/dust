import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const EXA_TOOLS_METADATA = createToolsRecord({
  search_people: {
    description:
      "Search for people by name, role, or company using Exa's people index. Use this to find LinkedIn profiles, professional backgrounds, or identify people at specific companies (e.g. 'CTO of Mistral AI', 'VP of Sales at French SaaS startups').",
    schema: {
      query: z
        .string()
        .describe("The search query to find information about a person."),
      num_results: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Number of results to return. Defaults to 5."),
      type: z
        .enum([
          "auto",
          "instant",
          "fast",
          "deep-lite",
          "deep",
          "deep-reasoning",
        ])
        .optional()
        .default("auto")
        .describe(
          "Search type. 'auto' (~1s, default), 'instant' (~250ms, real-time), 'fast' (~450ms), 'deep-lite' (~4s), 'deep' (4-15s, complex queries), 'deep-reasoning' (12-40s, hard research)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching for people",
      done: "Search people",
    },
  },
  search_companies: {
    description:
      "Search for companies by name, industry, or criteria using Exa's company index. Use this to find company profiles, competitors, or market research (e.g. 'French AI startups', 'competitors of Notion').",
    schema: {
      query: z
        .string()
        .describe("The search query to find information about a company."),
      num_results: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Number of results to return. Defaults to 5."),
      type: z
        .enum([
          "auto",
          "instant",
          "fast",
          "deep-lite",
          "deep",
          "deep-reasoning",
        ])
        .optional()
        .default("auto")
        .describe(
          "Search type. 'auto' (~1s, default), 'instant' (~250ms, real-time), 'fast' (~450ms), 'deep-lite' (~4s), 'deep' (4-15s, complex queries), 'deep-reasoning' (12-40s, hard research)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching for companies",
      done: "Search companies",
    },
  },
});

export const EXA_SERVER_NAME = "exa_people_and_company" as const;

export const EXA_SERVER = {
  serverInfo: {
    name: EXA_SERVER_NAME,
    version: "1.0.0",
    description:
      "Search for people and companies using Exa's AI-powered search.",
    authorization: null,
    icon: "ActionMagnifyingGlassIcon",
    documentationUrl: null,
  },
  tools: Object.values(EXA_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(EXA_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
