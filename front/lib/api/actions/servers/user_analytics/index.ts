import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import {
  USER_ANALYTICS_SERVER_NAME,
  USER_ANALYTICS_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/user_analytics/metadata";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { fetchAvailableSkillsBySkillId } from "@app/lib/api/assistant/observability/skill_usage";
import {
  fetchAvailableTools,
  resolveToolDisplayNames,
} from "@app/lib/api/assistant/observability/tool_usage";
import { fetchTopAgents } from "@app/lib/api/assistant/observability/top_agents";
import {
  buildAgentAnalyticsBaseQuery,
  daysToInstantRange,
} from "@app/lib/api/assistant/observability/utils";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { Ok } from "@app/types/shared/result";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const DAYS = 30;
const TOP_ITEMS_LIMIT = 100;

async function resolveAccessibleSkillNames(
  auth: Authenticator,
  rows: { skillId: string }[]
): Promise<string[]> {
  if (rows.length === 0) {
    return [];
  }
  const resources = await SkillResource.fetchByIds(
    auth,
    rows.map((r) => r.skillId)
  );
  const byId = new Map(resources.map((s) => [s.sId, s]));
  return rows
    .map((r) => byId.get(r.skillId)?.name)
    .filter((n): n is string => n !== undefined);
}

const handlers: ToolHandlers<typeof USER_ANALYTICS_TOOLS_METADATA> = {
  get_personal_usage: async (_params, { auth }) => {
    const user = auth.user();
    if (!user) {
      return new Ok([
        {
          type: "text" as const,
          text: "No authenticated user; cannot retrieve personal usage.",
        },
      ]);
    }

    const ws = auth.getNonNullableWorkspace();
    const { startDate, endDate } = daysToInstantRange(DAYS);
    const baseQuery = buildAgentAnalyticsBaseQuery({
      workspaceId: ws.sId,
      startDate,
      endDate,
      userIds: [user.sId],
    });

    const [skillsResult, toolsResult] = await Promise.all([
      fetchAvailableSkillsBySkillId(baseQuery),
      fetchAvailableTools(baseQuery),
    ]);

    const lines: string[] = [];

    const topSkillRows = (skillsResult.isOk() ? skillsResult.value : []).slice(
      0,
      TOP_ITEMS_LIMIT
    );
    const skillNames = await resolveAccessibleSkillNames(auth, topSkillRows);
    if (skillNames.length > 0) {
      lines.push(`Your top skills: ${skillNames.join(", ")}`);
    }

    const topTools = (toolsResult.isOk() ? toolsResult.value : []).slice(
      0,
      TOP_ITEMS_LIMIT
    );
    if (topTools.length > 0) {
      const resolved = await resolveToolDisplayNames(auth, topTools).catch(
        () => topTools
      );
      lines.push(
        `Your top tools: ${resolved.map((t) => t.displayName).join(", ")}`
      );
    }

    if (lines.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No personal usage recorded in the last 30 days.",
        },
      ]);
    }

    return new Ok([
      {
        type: "text" as const,
        text: `Personal usage — last 30 days:\n${lines.join("\n")}`,
      },
    ]);
  },

  get_workspace_activity: async (_params, { auth }) => {
    const ws = auth.getNonNullableWorkspace();
    const { startDate, endDate } = daysToInstantRange(DAYS);
    const baseQuery = buildAgentAnalyticsBaseQuery({
      workspaceId: ws.sId,
      startDate,
      endDate,
    });

    const [agentsResult, skillsResult] = await Promise.all([
      fetchTopAgents(auth, { days: DAYS, limit: TOP_ITEMS_LIMIT }),
      fetchAvailableSkillsBySkillId(baseQuery),
    ]);

    const lines: string[] = [];

    const candidateAgents = (
      agentsResult.isOk() ? agentsResult.value : []
    ).slice(0, TOP_ITEMS_LIMIT);
    let topAgents = candidateAgents;
    if (candidateAgents.length > 0) {
      // Filter to agents the user can actually access — fetchTopAgents is workspace-scoped
      // and its internal label resolver has a fallback that leaks names from private spaces.
      const accessible = await getAgentConfigurations(auth, {
        agentIds: candidateAgents.map((a) => a.agentId),
        variant: "extra_light",
      });
      const accessibleIds = new Set(accessible.map((a) => a.sId));
      topAgents = candidateAgents.filter((a) => accessibleIds.has(a.agentId));
    }
    if (topAgents.length > 0) {
      lines.push(
        `Most popular agents: ${topAgents.map((a, i) => `${i + 1}. ${a.name} (${a.messageCount} messages)`).join(", ")}`
      );
    }

    const topSkillRows = (skillsResult.isOk() ? skillsResult.value : []).slice(
      0,
      TOP_ITEMS_LIMIT
    );
    const skillNames = await resolveAccessibleSkillNames(auth, topSkillRows);
    if (skillNames.length > 0) {
      lines.push(`Trending skills: ${skillNames.join(", ")}`);
    }

    if (lines.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No workspace activity recorded in the last 30 days.",
        },
      ]);
    }

    return new Ok([
      {
        type: "text" as const,
        text: `Workspace activity — last 30 days:\n${lines.join("\n")}`,
      },
    ]);
  },
};

function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): McpServer {
  const server = makeInternalMCPServer(USER_ANALYTICS_SERVER_NAME);

  const tools = buildTools(USER_ANALYTICS_TOOLS_METADATA, handlers);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: USER_ANALYTICS_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
