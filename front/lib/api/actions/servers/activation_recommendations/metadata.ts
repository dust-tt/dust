import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const ACTIVATION_RECOMMENDATIONS_SERVER_NAME =
  "activation_recommendations" as const;

export const ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA = createToolsRecord({
  create_recommendation: {
    description:
      "Record a new activation recommendation that was shown to the user. " +
      "Call this immediately after surfacing a recommendation so it is tracked. " +
      "Returns a recommendationId to reference in update_recommendation.",
    schema: {
      content: z
        .string()
        .max(4096)
        .describe("The recommendation text shown to the user (1-3 sentences)."),
      rationale: z
        .string()
        .max(4096)
        .describe(
          "Internal reasoning for why this recommendation was selected."
        ),
    },
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Recording recommendation",
      done: "Recommendation recorded",
    },
  },
  update_recommendation: {
    description:
      "Update an activation recommendation's status or link created artifacts to it. " +
      "Use status 'executed' when the user accepts and runs the recommendation, " +
      "'dismissed' when the user declines. " +
      "Pass createdSkillId or createdTriggerId when the recommendation produced those artifacts.",
    schema: {
      recommendationId: z
        .string()
        .describe("The sId returned by create_recommendation."),
      status: z
        .enum(["executed", "dismissed"])
        .optional()
        .describe("New status for the recommendation."),
      createdSkillId: z
        .string()
        .optional()
        .describe("sId of a skill created as a result of this recommendation."),
      createdTriggerId: z
        .string()
        .optional()
        .describe(
          "sId of a trigger created as a result of this recommendation."
        ),
    },
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Updating recommendation",
      done: "Recommendation updated",
    },
  },
  list_recommendations: {
    description:
      "List past activation recommendations for this user. " +
      "Call before generating a new recommendation to avoid repeating suggestions " +
      "the user has already seen or dismissed.",
    schema: {},
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Fetching recommendation history",
      done: "Recommendation history fetched",
    },
  },
});

export const ACTIVATION_RECOMMENDATIONS_SERVER = {
  serverInfo: {
    name: ACTIVATION_RECOMMENDATIONS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Track activation recommendations and record user decisions on them.",
    authorization: null,
    icon: "ActionBrainIcon",
    documentationUrl: null,
  },
  tools: Object.values(ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
