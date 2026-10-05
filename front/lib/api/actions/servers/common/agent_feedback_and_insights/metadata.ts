import { z } from "zod";

export const GET_AGENT_FEEDBACK_TOOL_NAME = "get_agent_feedback" as const;
export const GET_AGENT_INSIGHTS_TOOL_NAME = "get_agent_insights" as const;

export const GET_AGENT_FEEDBACK_DESCRIPTION =
  "Get user feedback for the agent.";
export const GET_AGENT_INSIGHTS_DESCRIPTION =
  "Get insight and analytics data for the agent, including the number of active users, " +
  "the conversation and message counts, and the feedback statistics.";

export const agentFeedbackSchema = {
  limit: z
    .number()
    .optional()
    .default(50)
    .describe("Maximum number of feedback items to return (default: 50)"),
  filter: z
    .enum(["active", "all"])
    .optional()
    .default("active")
    .describe(
      "Filter type: 'active' for non-dismissed feedback only (default), 'all' for all feedback"
    ),
  latestVersionOnly: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "When true (default), only return feedback for the latest version of the agent. When false, return feedback for all versions."
    ),
};

export const agentInsightsSchema = {
  days: z
    .number()
    .optional()
    .default(30)
    .describe("Number of days to include in the analysis (default: 30)"),
};
