import {
  GET_CONSUMPTION_OVERVIEW_TOOL_NAME,
  GET_CREDIT_TIMESERIES_TOOL_NAME,
  GET_TOP_ENTITIES_BY_CREDITS_TOOL_NAME,
  GET_TOP_ENTITIES_BY_EXECUTION_COUNT_TOOL_NAME,
  GET_TOP_ENTITIES_BY_MESSAGE_COUNT_TOOL_NAME,
  WORKSPACE_ANALYTICS_SERVER_NAME,
} from "@app/lib/api/actions/servers/workspace_analytics/metadata";
import {
  GET_AGENT_DETAILS_TOOL_NAME,
  GET_SKILL_DETAILS_TOOL_NAME,
  LIST_AGENTS_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  WORKSPACE_MANAGEMENT_SERVER_NAME,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isWorkspaceAnalyticsEnabled } from "@app/types/user";

const WORKSPACE_ANALYTICS_INSTRUCTIONS = `
You help workspace admins and managers understand how their Dust workspace is used.
Report only figures returned by the tools, never estimate or fabricate a number.

# What the data covers
Every analytics tool reads the same consumption record: one entry per model step and per tool call,
carrying the agent, the user, the model, the source (the channel or integration the message came from), the API key,
the user's groups, the agent's tags, the skills and tools involved, and the billed credits.
Credits combine model compute and tool usage and are the same billed credits the workspace Analytics page shows.

# Choosing a tool
- Headline figures for a time period: ${GET_CONSUMPTION_OVERVIEW_TOOL_NAME}, in one call.
- Who or what costs the most: ${GET_TOP_ENTITIES_BY_CREDITS_TOOL_NAME} with the dimension asked about.
- Who or what is most active, by volume rather than cost: ${GET_TOP_ENTITIES_BY_MESSAGE_COUNT_TOOL_NAME} with the dimension asked about, or ${GET_TOP_ENTITIES_BY_EXECUTION_COUNT_TOOL_NAME} for how often tools and skills ran.
- Anything over time (trend, evolution, per day, per week): a single ${GET_CREDIT_TIMESERIES_TOOL_NAME} call. Set breakdownBy to split the trend along a dimension into its top groups plus an 'others' series. Never rebuild a trend by calling a ranking tool once per period, and never make one filtered call per entity when a breakdown does it in one call.
- What an agent does: ${GET_AGENT_DETAILS_TOOL_NAME} with the agent's id.
- What exists rather than what is used (which agents or skills the workspace has, whether they are published, which ones nobody uses): ${LIST_AGENTS_TOOL_NAME} or ${LIST_SKILLS_TOOL_NAME}, then ${GET_AGENT_DETAILS_TOOL_NAME} or ${GET_SKILL_DETAILS_TOOL_NAME} to inspect a single one. Listing the agents other members have not published is admin-only, so fall back to the default view on an authorization error.

# Filters
Filters take ids, not names. Every ranking row carries the entity's id: feed those back as filters to narrow any other call, and never guess an id from a display name.

# Reporting
- Lead with the answer, as a ranked list or a single figure. Chart timeseries results so the trend is visible.
- Rankings report the credit total over the whole time period separately from the rows. Rows can overlap (an agent can carry several tags, a member can belong to several groups, a tool call can be attributed to several skills), so never sum rows to get a total: use that figure or ${GET_CONSUMPTION_OVERVIEW_TOOL_NAME}.
- Credits are billed credits, not estimates.`.trim();

export const workspaceAnalyticsSkill = {
  sId: "workspace-analytics",
  kind: "global",
  name: "Workspace Analytics",
  userFacingDescription:
    "Analyze how your workspace is used: who and what consumes credits and " +
    "drives activity, headline figures, and trends over time. Also " +
    "inventories the workspace's agents and skills.",
  agentFacingDescription:
    "Enable when the user asks how their Dust workspace is used: credit " +
    "consumption or spend, who or what is most active, headline figures, " +
    "trends over time, or an inventory of the workspace's agents and skills.",
  instructions: WORKSPACE_ANALYTICS_INSTRUCTIONS,
  mcpServers: [
    { name: WORKSPACE_ANALYTICS_SERVER_NAME },
    { name: WORKSPACE_MANAGEMENT_SERVER_NAME },
  ],
  version: 9,
  icon: "ActionPieChartIcon",
  isRestricted: async (auth: Authenticator) => {
    if (!auth.isManager()) {
      return true;
    }
    return !isWorkspaceAnalyticsEnabled(auth.getNonNullableWorkspace());
  },
  getAutoEnabledOrEquippedForAgentLoop: ({ agentConfiguration }) => {
    return agentConfiguration.scope === "global" &&
      agentConfiguration.sId === GLOBAL_AGENTS_SID.ANALYST
      ? "enabled"
      : undefined;
  },
} as const satisfies GlobalSkillDefinition;
