import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { stripMarkdown } from "@app/types/shared/utils/markdown";
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
      body: z
        .string()
        .max(500)
        .optional()
        .describe(
          "Optional 1-3 sentence explanation of the recommendation. " +
            "Explain the 'why' in more depth than content: what context makes this " +
            "the right suggestion right now for this user. Omit if the title+content " +
            "are already self-explanatory."
        ),
      steps: z
        .array(z.string().max(100))
        .max(8)
        .optional()
        .describe(
          "Optional ordered list of concrete steps to complete the recommendation. " +
            "Each step is a short imperative sentence (< 60 chars). " +
            "Only include when the action needs more than one step to complete. " +
            "Omit for single-action recommendations."
        ),
      ctaLabel: z
        .string()
        .max(40)
        .transform((label) => stripMarkdown(label).trim())
        .optional()
        .describe(
          "Optional label for the primary call-to-action button on the recommendation card. " +
            "Defaults to 'Get started' when omitted. Use when a more specific verb fits, " +
            "e.g. 'Create agent', 'Set up trigger', 'Share frame'."
        ),
      sourceIcon: z
        .string()
        .max(255)
        .optional()
        .describe(
          "Icon for the evidence behind this recommendation. Always pass with " +
            "sourceLabel. Pick the single best match for the actual evidence — do not " +
            "default to the same icon every time. " +
            "ConnectorProvider ids (use when a connected source is the signal): " +
            "'slack', 'github', 'notion', 'google_drive', 'confluence', " +
            "'microsoft', 'intercom', 'salesforce', 'gong', 'zendesk'. " +
            "Sparkle icons (use for non-connector evidence): " +
            "'Users01' (teammate / peer usage), " +
            "'MessageCircle01' (a conversation or thread), " +
            "'Calendar' (upcoming or recurring meetings), " +
            "'Mail01' (inbox / email), " +
            "'SearchLg' (recent work or research), " +
            "'Target01' (a work priority or goal), " +
            "'BarChart01' (usage or activity pattern), " +
            "'Lightbulb01' (a tailored suggestion), " +
            "'Brain' (personal AI / agent usage), " +
            "'PuzzlePiece01' (skill adoption), " +
            "'Zap' (automation / triggers), " +
            "'ActionFrame' (a Frame as the evidence), " +
            "'Dataflow01' (a workflow), " +
            "'Database01' (a knowledge base)."
        ),
      sourceLabel: z
        .string()
        .max(40)
        .optional()
        .describe(
          "Short standalone line explaining why this recommendation is relevant to " +
            "this user right now. Shown without context that it is a 'source' field, " +
            "so it must make sense alone. Always pass with sourceIcon. Invent the line " +
            "from the actual evidence; prefer what the evidence means for them over " +
            "attribution to a Dust artifact. Style examples (adapt to the real " +
            "evidence, do not reuse verbatim): 'From your #design Slack channel', " +
            "'Matches your recent work', 'Because your teammates are using the \"Release notes\" skill', " +
            "'Build on your pilot work'. Never use only a bare product/source name " +
            "or only the recommended Skill/agent/Frame name."
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
    name: "list_work_areas",
    description:
      "List work areas for the current Activation Pod. Returns each work area's id, " +
      "title, description, and status.",
    schema: {
      podId: z
        .string()
        .describe(
          "The current Pod ID from the activation context. Always pass it to scope results to this Pod."
        ),
      status: z
        .enum(["candidate", "confirmed", "dismissed"])
        .optional()
        .describe("Only return work areas with this status. Omit for all."),
    },
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Fetching work areas",
      done: "Work areas fetched",
    },
  },
  {
    name: "create_work_areas",
    description:
      "Create one or more work areas for the current Activation Pod. Each is created " +
      "with status 'candidate'. Returns the created work areas with their ids.",
    schema: {
      workAreas: z
        .array(
          z.object({
            title: z
              .string()
              .max(255)
              .describe(
                "Short name of the work area (e.g. 'Weekly pipeline reporting')."
              ),
            description: z
              .string()
              .max(512)
              .describe("One sentence describing what the work area covers."),
          })
        )
        .min(1)
        .max(10)
        .describe("The work areas to create."),
    },
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Saving work areas",
      done: "Work areas saved",
    },
  },
  {
    name: "update_work_area",
    description: "Update a single work area's status, title, or description.",
    schema: {
      workAreaId: z.string().describe("The id of the work area to update."),
      status: z
        .enum(["confirmed", "dismissed"])
        .optional()
        .describe("New status for the work area."),
      title: z.string().max(255).optional().describe("New title."),
      description: z.string().max(512).optional().describe("New description."),
    },
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Updating work area",
      done: "Work area updated",
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
