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
        .max(60)
        .describe(
          "Action label shown in the 'Recommendations for you' list and on the " +
            "recommendation card (4-6 words). Name BOTH the " +
            "concrete outcome from the user's real work AND the Dust feature " +
            "that delivers it, in plain user language — a stranger reading only " +
            "this line should know exactly what they get and how. Do NOT use " +
            "meta, internal, or advanced framing that hides the value or the " +
            "feature. Never a vague verb like 'Explore', 'Try', or 'Get started'. " +
            "Good: 'Share a frame of the latest US forecast review' (outcome = " +
            "the forecast review; feature = a frame). " +
            "Good: 'Build an agent that pings you on each new PR' (outcome = PR " +
            "pings; feature = an agent + trigger). " +
            "Bad: 'Build activation review brief' (meta — hides both the value " +
            "and the feature being learned). " +
            "Bad: 'Try a HubSpot use case'."
        ),
      content: z
        .string()
        .max(80)
        .describe(
          "One-line subtitle under the title . Be explicit " +
            "about (1) what you get out of it — the concrete payoff — and (2) why it " +
            "was suggested for THIS user — the evidence from their real work (role, " +
            "habit, peer pattern, personal usage). Plain language; complements the " +
            "title, never restates it or hides behind meta/internal framing. " +
            "Good (with title 'Share a frame of the latest US forecast review'): " +
            "'Skip rebuilding the Monday deck — peers in your role already do this'. " +
            "Good (with title 'Build an agent that pings you on each new PR'): " +
            "'Catch every review request without watching Slack all day'. " +
            "Bad: 'A useful HubSpot recommendation'. " +
            "Bad: 'Learn more about frames and agents'."
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
  {
    name: "get_tool_execution_modes",
    description:
      "Get the resolved execution mode for each tool available in the current run. " +
      "Returns one of three modes for each tool: " +
      "'auto' — runs silently without user approval; " +
      "'requires_approval' — pauses execution until the user approves; " +
      "'not_connected' — the user has not connected to this server yet (OAuth required).",
    schema: {
      executionModes: z
        .array(z.enum(["auto", "requires_approval", "not_connected"]))
        .optional()
        .describe(
          "When set, only return tools whose execution mode is one of these values. Omit to return all tools."
        ),
    },
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Checking tool execution modes",
      done: "Tool execution modes ready",
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
