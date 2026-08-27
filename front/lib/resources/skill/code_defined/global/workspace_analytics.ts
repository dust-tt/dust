import {
  GET_AGENT_DETAILS_TOOL_NAME,
  GET_SKILL_DETAILS_TOOL_NAME,
  LIST_AGENTS_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  WORKSPACE_MANAGEMENT_SERVER_NAME,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { isWorkspaceAnalyticsEnabled } from "@app/types/user";

export const workspaceAnalyticsSkill = {
  sId: "workspace-analytics",
  kind: "global",
  name: "Workspace Analytics",
  userFacingDescription:
    "Analyze how your workspace is being used — for example, which agents " +
    "are used most — and inventory its agents and skills. Available to " +
    "workspace admins and managers only.",
  agentFacingDescription:
    "Enable when a workspace admin or manager asks about workspace usage " +
    "analytics, such as which agents are used most, or wants to inventory the " +
    "workspace's agents and skills. Restricted to admins and managers.",
  instructions:
    "You help workspace admins and managers analyze how their Dust workspace " +
    "is being used. Use the available workspace analytics tools to answer the " +
    "question and present the results clearly. Only report figures returned " +
    "by the tools — never fabricate numbers. If a tool reports an " +
    "authorization error, explain that workspace analytics is restricted to " +
    "workspace admins and managers.\n\n" +
    "Choosing a tool:\n" +
    "- For trends over time — anything spanning multiple days or phrased as " +
    "'over time', 'per day', 'evolution', 'trend' — make a single timeseries " +
    "call: get_credit_timeseries for credit/spend trends, or " +
    "get_usage_timeseries for activity, skill, or tool trends. They return the " +
    "whole series bucketed by day/week/month in one call.\n" +
    "- Never build a trend by calling a snapshot tool (get_credit_usage, " +
    "get_top_*) once per day or in parallel per period — it is slower and " +
    "unnecessary, the timeseries tools already bucket over time.\n" +
    "- To attribute spend — which agents, users, models, tools, skills, " +
    "sources, API keys, groups, tags or conversations cost the most — call " +
    "get_top_entities_by_credits with that dimension. Use get_credit_usage " +
    "only for a single window's total credits.\n" +
    "- For a credit trend split by agent, user or model (e.g. 'how did each " +
    "agent's spend evolve'), set breakdownBy on get_credit_timeseries — one " +
    "call returns the top groups plus an 'other' series. Do not make one " +
    "filtered call per agent, user or model.\n" +
    "- To scope any tool to specific models, call get_top_models first to get " +
    "the exact model ids in use, then pass them as modelIds — never guess a " +
    "model id from its display name.\n" +
    `- To inventory what EXISTS rather than what is used — which agents or ` +
    `skills the workspace has, whether they are published or discoverable, ` +
    `which ones nobody uses — call ${LIST_AGENTS_TOOL_NAME} or ` +
    `${LIST_SKILLS_TOOL_NAME}, then ${GET_AGENT_DETAILS_TOOL_NAME} or ` +
    `${GET_SKILL_DETAILS_TOOL_NAME} to inspect a single one.\n` +
    `- Listing the agents other members have not published is admin-only, so ` +
    `fall back to the default view if it reports an authorization error.\n` +
    "- Chart timeseries results so the admin can see the trend.",
  mcpServers: [
    { name: "workspace_analytics" },
    { name: WORKSPACE_MANAGEMENT_SERVER_NAME },
  ],
  version: 6,
  icon: "ActionPieChartIcon",
  isRestricted: async (auth: Authenticator) => {
    if (!auth.isManager()) {
      return true;
    }
    return !isWorkspaceAnalyticsEnabled(auth.getNonNullableWorkspace());
  },
} as const satisfies GlobalSkillDefinition;
