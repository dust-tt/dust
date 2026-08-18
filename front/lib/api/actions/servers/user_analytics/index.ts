import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import {
  USER_ANALYTICS_SERVER_NAME,
  USER_ANALYTICS_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/user_analytics/metadata";
import type { ResolvedTimeWindow } from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { resolveTimeWindow } from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { MIN_USERS_FOR_ANONYMITY } from "@app/lib/api/assistant/observability/anonymity";
import { fetchJobTypeCohort } from "@app/lib/api/assistant/observability/job_type_cohorts";
import { fetchAvailableSkillsBySkillId } from "@app/lib/api/assistant/observability/skill_usage";
import {
  fetchAvailableTools,
  resolveToolDisplayNames,
} from "@app/lib/api/assistant/observability/tool_usage";
import { fetchTopAgents } from "@app/lib/api/assistant/observability/top_agents";
import { fetchTopUsers } from "@app/lib/api/assistant/observability/top_users";
import {
  buildAgentAnalyticsBaseQuery,
  daysToInstantRange,
} from "@app/lib/api/assistant/observability/utils";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const DAYS = 30;
const TOP_ITEMS_LIMIT = 100;

async function resolveAccessibleSkills(
  auth: Authenticator,
  rows: { skillId: string; totalExecutions: number }[]
): Promise<{ name: string; totalExecutions: number }[]> {
  if (rows.length === 0) {
    return [];
  }
  const resources = await SkillResource.fetchByIds(
    auth,
    rows.map((r) => r.skillId)
  );
  const byId = new Map(resources.map((s) => [s.sId, s]));
  return rows.flatMap((r) => {
    const name = byId.get(r.skillId)?.name;
    return name !== undefined
      ? [{ name, totalExecutions: r.totalExecutions }]
      : [];
  });
}

// Builds the detailed usage summary sections (top agents, skills, and tools)
// for a set of users over a window. Each section is a titled block of numbered
// lines ordered most-used first, mirroring the formatting of the
// workspace_analytics tools. Scoping is entirely by `userIds`, so the same
// renderer serves both the caller's own usage and an anonymized job-type
// cohort.
async function buildDetailedUsageSections(
  auth: Authenticator,
  { userIds, window }: { userIds: string[]; window: ResolvedTimeWindow }
): Promise<string[]> {
  const ws = auth.getNonNullableWorkspace();
  const { startDate, endDate } = window;
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: ws.sId,
    startDate,
    endDate,
    userIds,
  });

  const [skillsResult, toolsResult, agentsResult] = await Promise.all([
    fetchAvailableSkillsBySkillId(baseQuery),
    fetchAvailableTools(baseQuery),
    fetchTopAgents(auth, {
      startDate,
      endDate,
      limit: TOP_ITEMS_LIMIT,
      userIds,
    }),
  ]);

  const sections: string[] = [];

  // Filter to agents the caller can actually access — fetchTopAgents is
  // workspace-scoped and its internal label resolver has a fallback that leaks
  // names from private spaces.
  const candidateAgents = (agentsResult.isOk() ? agentsResult.value : []).slice(
    0,
    TOP_ITEMS_LIMIT
  );
  let topAgents = candidateAgents;
  if (candidateAgents.length > 0) {
    const accessible = await getAgentConfigurations(auth, {
      agentIds: candidateAgents.map((a) => a.agentId),
      variant: "extra_light",
    });
    const accessibleIds = new Set(accessible.map((a) => a.sId));
    topAgents = candidateAgents.filter((a) => accessibleIds.has(a.agentId));
  }
  if (topAgents.length > 0) {
    const lines = topAgents.map(
      (a, i) =>
        `${i + 1}. ${a.name} [${a.agentId}] — ${a.messageCount} messages`
    );
    sections.push(`Top agents (most used first):\n${lines.join("\n")}`);
  }

  const topSkillRows = (skillsResult.isOk() ? skillsResult.value : []).slice(
    0,
    TOP_ITEMS_LIMIT
  );
  const skills = await resolveAccessibleSkills(auth, topSkillRows);
  if (skills.length > 0) {
    const lines = skills.map(
      (s, i) => `${i + 1}. ${s.name} — ${s.totalExecutions} executions`
    );
    sections.push(`Top skills (most used first):\n${lines.join("\n")}`);
  }

  const topTools = (toolsResult.isOk() ? toolsResult.value : []).slice(
    0,
    TOP_ITEMS_LIMIT
  );
  if (topTools.length > 0) {
    const resolved = await resolveToolDisplayNames(auth, topTools).catch(
      () => topTools
    );
    const lines = resolved.map(
      (t, i) => `${i + 1}. ${t.displayName} — ${t.totalExecutions} executions`
    );
    sections.push(`Top tools (most used first):\n${lines.join("\n")}`);
  }

  return sections;
}

const handlers: ToolHandlers<typeof USER_ANALYTICS_TOOLS_METADATA> = {
  get_personal_usage: async (
    { jobType, period, startDate, endDate, timezone },
    { auth }
  ) => {
    const user = auth.user();
    if (!user) {
      return new Ok([
        {
          type: "text" as const,
          text: "No authenticated user; cannot retrieve personal usage.",
        },
      ]);
    }

    const window = resolveTimeWindow(
      { period, startDate, endDate, timezone },
      "last_30_days"
    );
    if (window.isErr()) {
      return new Err(new MCPError(window.error, { tracked: false }));
    }
    const { label } = window.value;

    // Job-type breakdown: report aggregated usage for everyone in the workspace
    // sharing this job type, but only when the cohort is large enough to keep
    // individuals anonymous.
    if (jobType) {
      const cohort = await fetchJobTypeCohort(auth, jobType);
      const jobTypeLabel = JOB_TYPE_LABELS[jobType];

      if (cohort.kind === "below_anonymity_floor") {
        return new Ok([
          {
            type: "text" as const,
            text:
              `Usage for the ${jobTypeLabel} job type is not available: it has ` +
              `${cohort.userCount} user${cohort.userCount === 1 ? "" : "s"} — ` +
              `fewer than the ${MIN_USERS_FOR_ANONYMITY} required ` +
              "to keep individual usage anonymous.",
          },
        ]);
      }

      const sections = await buildDetailedUsageSections(auth, {
        userIds: cohort.userIds,
        window: window.value,
      });
      if (sections.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text:
              `No usage recorded for the ${jobTypeLabel} job type ` +
              `(${cohort.userCount} users) over ${label}.`,
          },
        ]);
      }
      return new Ok([
        {
          type: "text" as const,
          text:
            `Usage for the ${jobTypeLabel} job type (${cohort.userCount} users) ` +
            `— ${label}:\n\n${sections.join("\n\n")}`,
        },
      ]);
    }

    const sections = await buildDetailedUsageSections(auth, {
      userIds: [user.sId],
      window: window.value,
    });
    if (sections.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `No personal usage recorded over ${label}.`,
        },
      ]);
    }
    return new Ok([
      {
        type: "text" as const,
        text: `Personal usage — ${label}:\n\n${sections.join("\n\n")}`,
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

    // Anonymity floor: a workspace-wide aggregate can de-anonymize individuals
    // when only a handful of people are active, so require a minimum number of
    // distinct active users before surfacing anything. Fetching the top users
    // capped at the floor is enough to decide — the count saturates at the
    // threshold.
    const activeUsersResult = await fetchTopUsers(auth, {
      startDate,
      endDate,
      limit: MIN_USERS_FOR_ANONYMITY,
    });
    const activeUserCount = activeUsersResult.isOk()
      ? activeUsersResult.value.length
      : 0;
    if (activeUserCount < MIN_USERS_FOR_ANONYMITY) {
      return new Ok([
        {
          type: "text" as const,
          text:
            "Workspace activity is not available: only " +
            `${activeUserCount} user${activeUserCount === 1 ? "" : "s"} ` +
            `active in the last ${DAYS} days, below the ` +
            `${MIN_USERS_FOR_ANONYMITY}-user minimum required to keep ` +
            "individual activity anonymous.",
        },
      ]);
    }

    const [agentsResult, skillsResult] = await Promise.all([
      fetchTopAgents(auth, { days: DAYS, limit: TOP_ITEMS_LIMIT }),
      fetchAvailableSkillsBySkillId(baseQuery),
    ]);

    const sections: string[] = [];

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
      const lines = topAgents.map(
        (a, i) =>
          `${i + 1}. ${a.name} [${a.agentId}] — ${a.messageCount} messages`
      );
      sections.push(
        `Most popular agents (most used first):\n${lines.join("\n")}`
      );
    }

    const topSkillRows = (skillsResult.isOk() ? skillsResult.value : []).slice(
      0,
      TOP_ITEMS_LIMIT
    );
    const skills = await resolveAccessibleSkills(auth, topSkillRows);
    if (skills.length > 0) {
      const lines = skills.map(
        (s, i) => `${i + 1}. ${s.name} — ${s.totalExecutions} executions`
      );
      sections.push(`Trending skills (most used first):\n${lines.join("\n")}`);
    }

    if (sections.length === 0) {
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
        text: `Workspace activity — last 30 days:\n\n${sections.join("\n\n")}`,
      },
    ]);
  },
};

export const TOOLS = buildTools(USER_ANALYTICS_TOOLS_METADATA, handlers);

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(USER_ANALYTICS_SERVER_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: USER_ANALYTICS_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
