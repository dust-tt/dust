import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

export const workspaceAnalyticsSkill = {
  sId: "workspace-analytics",
  name: "Workspace Analytics",
  userFacingDescription:
    "Analyze how your workspace is being used — for example, which agents " +
    "are used most. Available to workspace admins only.",
  agentFacingDescription:
    "Enable when a workspace admin asks about workspace usage analytics, " +
    "such as which agents are used most. Restricted to admins.",
  instructions:
    "You help workspace admins analyze how their Dust workspace is being " +
    "used. Use the available workspace analytics tools to answer the admin's " +
    "question and present the results clearly. Only report figures returned " +
    "by the tools — never fabricate numbers. If a tool reports an " +
    "authorization error, explain that workspace analytics is restricted to " +
    "workspace admins.\n\n" +
    "Choosing a tool:\n" +
    "- For trends over time — anything spanning multiple days or phrased as " +
    "'over time', 'per day', 'evolution', 'trend' — make a single timeseries " +
    "call: get_credit_timeseries for credit/spend trends, or " +
    "get_usage_timeseries for activity, skill, or tool trends. They return the " +
    "whole series bucketed by day/week/month in one call.\n" +
    "- Never build a trend by calling a snapshot tool (get_credit_usage, " +
    "get_top_*) once per day or in parallel per period — it is slower and " +
    "unnecessary, the timeseries tools already bucket over time.\n" +
    "- Use get_credit_usage for a single window's total credits or to " +
    "attribute spend to the top agents or users, not for per-day trends.\n" +
    "- Chart timeseries results so the admin can see the trend.\n" +
    "- Credit figures are estimates; when reporting them, tell the admin they " +
    "are approximate and point to the workspace Usage page for exact billed " +
    "amounts.",
  mcpServers: [{ name: "workspace_analytics" }],
  version: 2,
  icon: "ActionPieChartIcon",
  isRestricted: async (auth: Authenticator) => {
    if (!auth.isAdmin()) {
      return true;
    }
    const flags = await getFeatureFlags(auth);
    return !flags.includes("workspace_analytics");
  },
} as const satisfies GlobalSkillDefinition;
