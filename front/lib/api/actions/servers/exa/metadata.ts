import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const EXA_TOOLS_METADATA = [
  {
    name: "search_people",
    description:
      "Find a person by name, job title, or employer using Exa's people directory. Looks up an individual's LinkedIn profile, professional background, and career history, or identifies who holds a given role at a specific company (e.g. 'CTO of Stripe', 'VP of Sales at French SaaS startups').",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "search_companies",
    description:
      "Find a company, business, or startup by name, industry, or criteria using Exa's company directory. Looks up company profiles, identifies competitors, and surfaces firms matching a sector or market (e.g. 'French fintech startups', 'competitors of Notion').",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

const EXA_SERVER_NAME = "exa_people_and_company" as const;

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
  tools: EXA_TOOLS_METADATA,
} as const satisfies ServerMetadata;
