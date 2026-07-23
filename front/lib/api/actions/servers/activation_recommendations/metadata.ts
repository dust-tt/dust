import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const ACTIVATION_RECOMMENDATIONS_SERVER_NAME =
  "activation_recommendations" as const;

export const ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA = [
  {
    name: "create_recommendation",
    description:
      "Record a new activation recommendation that was shown to the user. " +
      "Call this immediately after surfacing a recommendation so it is tracked. " +
      "Returns a recommendationId to reference in update_recommendation.",
    schema: {
      title: z
        .string()
        .max(4096)
        .describe(
          "Action label shown in the recommendations list (6-8 words). " +
            "Be specific enough that the user knows exactly what they would be doing. " +
            "Example: 'Ask about recent Slack decisions'."
        ),
      content: z
        .string()
        .max(4096)
        .describe(
          "Brief subtitle shown under the title in the recommendations list (8-10 words). " +
            "Explain the 'how' or 'why' in plain language. " +
            "Example: 'Find past decisions in your Slack workspace in seconds'."
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
  {
    name: "update_recommendation",
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
  {
    name: "list_recommendations",
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
] as const;

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
  tools: ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
