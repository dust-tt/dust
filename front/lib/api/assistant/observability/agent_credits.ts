import {
  getAgentConfigurations,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import {
  getAgentModelDisplayName,
  getUserDisplayName,
} from "@app/lib/api/assistant/observability/credit_labels";
import {
  buildCreditsScopeQuery,
  daysToInstantRange,
} from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type AgentCreditUser = {
  userId: string;
  name: string;
  imageUrl: string | null;
};

// description is set only when the admin can read the skill.
export type AgentCreditSkill = {
  skillId: string;
  name: string;
  description: string | null;
};

export type AgentCreditRow = {
  agentId: string;
  name: string;
  pictureUrl: string | null;
  modelDisplayName: string;
  description: string;
  credits: number;
  topUsers: AgentCreditUser[];
  topSkills: AgentCreditSkill[];
};

export type GetAgentCreditsResponse = { agents: AgentCreditRow[] };

type SubBucket = { key: string };

type SkillBucket = {
  key: string;
  name?: estypes.AggregationsMultiBucketAggregateBase<SubBucket>;
};

type AgentBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
  top_users?: estypes.AggregationsMultiBucketAggregateBase<SubBucket>;
  top_skills?: {
    by_skill?: estypes.AggregationsMultiBucketAggregateBase<SkillBucket>;
  };
};

type AgentCreditAggs = {
  by_agent?: estypes.AggregationsMultiBucketAggregateBase<AgentBucket>;
};

// Per-agent AWU credits (cost.full_awu) over the last `days`: the agent's
// current model and description, its top 3 users (by cost) and top 3 skills (by
// execution count — skills carry no per-skill cost). Ranked by credits desc.
// Non-free scope; the programmatic "unknown" user is excluded from the top
// users (but its usage still counts toward the agent's credits). When `search`
// is set, the ranking is scoped to the matching agents so matches outside the
// top `limit` still surface.
export async function fetchAgentCreditBreakdown(
  auth: Authenticator,
  { days, limit, search }: { days: number; limit: number; search?: string }
): Promise<Result<AgentCreditRow[], ElasticsearchError>> {
  const { startDate, endDate } = daysToInstantRange(days, "UTC");

  let includeAgentIds: string[] | undefined;
  if (search) {
    const normalized = search.trim().toLowerCase();
    const [workspaceMatches, globalAgents] = await Promise.all([
      searchAgentConfigurationsByName(auth, search),
      getGlobalAgents(auth, undefined, "light"),
    ]);
    const globalMatches = globalAgents.filter((agent) =>
      agent.name.toLowerCase().includes(normalized)
    );
    includeAgentIds = Array.from(
      new Set([...workspaceMatches, ...globalMatches].map((agent) => agent.sId))
    ).slice(0, limit);
    if (includeAgentIds.length === 0) {
      return new Ok([]);
    }
  }

  const query = buildCreditsScopeQuery(auth, {
    startDate,
    endDate,
    extraFilters: [{ exists: { field: "agent_id" } }],
  });

  const result = await searchAnalytics<never, AgentCreditAggs>(query, {
    aggregations: {
      by_agent: {
        terms: {
          field: "agent_id",
          size: limit,
          order: { credits: "desc" },
          ...(includeAgentIds ? { include: includeAgentIds } : {}),
        },
        aggs: {
          credits: { sum: { field: "cost.full_awu" } },
          top_users: {
            terms: {
              field: "user_id",
              size: 3,
              exclude: ["unknown"],
              order: { user_credits: "desc" },
            },
            aggs: { user_credits: { sum: { field: "cost.full_awu" } } },
          },
          top_skills: {
            nested: { path: "skills_used" },
            aggs: {
              by_skill: {
                terms: { field: "skills_used.skill_id", size: 3 },
                aggs: {
                  name: { terms: { field: "skills_used.skill_name", size: 1 } },
                },
              },
            },
          },
        },
      },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<AgentBucket>(
    result.value.aggregations?.by_agent?.buckets
  );
  if (buckets.length === 0) {
    return new Ok([]);
  }

  const agentIds = buckets.map((bucket) => String(bucket.key));
  const userIds = Array.from(
    new Set(
      buckets.flatMap((bucket) =>
        bucketsToArray<SubBucket>(bucket.top_users?.buckets).map((user) =>
          String(user.key)
        )
      )
    )
  );
  const skillIds = Array.from(
    new Set(
      buckets.flatMap((bucket) =>
        bucketsToArray<SkillBucket>(bucket.top_skills?.by_skill?.buckets).map(
          (skill) => String(skill.key)
        )
      )
    )
  );

  const [agents, users, skills] = await Promise.all([
    getAgentConfigurations(auth, { agentIds, variant: "light" }),
    userIds.length > 0 ? UserResource.fetchByIds(userIds) : Promise.resolve([]),
    skillIds.length > 0
      ? SkillResource.fetchByIds(auth, skillIds)
      : Promise.resolve([]),
  ]);

  const agentsById = new Map(agents.map((agent) => [agent.sId, agent]));
  const usersById = new Map(users.map((user) => [user.sId, user]));
  // fetchByIds only returns skills the admin can read; others get no description.
  const skillsById = new Map(skills.map((skill) => [skill.sId, skill]));

  const rows: AgentCreditRow[] = buckets.map((bucket) => {
    const agentId = String(bucket.key);
    const agent = agentsById.get(agentId);

    const topUsers: AgentCreditUser[] = bucketsToArray<SubBucket>(
      bucket.top_users?.buckets
    ).map((userBucket) => {
      const userId = String(userBucket.key);
      const user = usersById.get(userId);
      return {
        userId,
        name: getUserDisplayName(user),
        imageUrl: user?.imageUrl ?? null,
      };
    });

    const topSkills: AgentCreditSkill[] = bucketsToArray<SkillBucket>(
      bucket.top_skills?.by_skill?.buckets
    ).map((skillBucket) => {
      const skillId = String(skillBucket.key);
      const skill = skillsById.get(skillId);
      const docName = bucketsToArray<SubBucket>(skillBucket.name?.buckets)[0]
        ?.key;
      return {
        skillId,
        name: skill?.name ?? docName ?? "Unknown skill",
        description: skill?.userFacingDescription || null,
      };
    });

    return {
      agentId,
      name: agent?.name ?? "Unknown agent",
      pictureUrl: agent?.pictureUrl ?? null,
      modelDisplayName: getAgentModelDisplayName(agent?.model),
      // Only surface the description for agents this admin can read; private
      // agents owned by others appear in usage but their description must not.
      description:
        agent && !agent.canRead
          ? "Private agent: description unavailable"
          : (agent?.description ?? ""),
      credits: Math.round(bucket.credits?.value ?? 0),
      topUsers,
      topSkills,
    };
  });

  return new Ok(rows);
}
