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
    "workspace admins.",
  mcpServers: [{ name: "workspace_analytics" }],
  version: 1,
  icon: "ActionPieChartIcon",
  isRestricted: async (auth: Authenticator) => {
    if (!auth.isAdmin()) {
      return true;
    }
    const flags = await getFeatureFlags(auth);
    return !flags.includes("workspace_analytics");
  },
} as const satisfies GlobalSkillDefinition;
