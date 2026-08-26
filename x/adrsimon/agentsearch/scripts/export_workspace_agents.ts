import { fetchAgentExportRows } from "@app/lib/api/analytics/agents_export";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import { buildDaysConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/period";
import {
  CARDINALITY_PRECISION_THRESHOLD,
  CONSUMPTION_DIMENSION_FIELDS,
  CREDIT_MICRO_FIELD,
  MAX_EXPORT_TERMS_SIZE,
  uniqueMessagesCardinalityAgg,
} from "@app/lib/api/analytics/consumption/scope";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAgentsEditors, getAuthors } from "@app/lib/api/assistant/editors";
import {
  bucketsToArray,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { estypes } from "@elastic/elasticsearch";
import * as fs from "fs";

type GroupBucket = {
  key: string;
  unique_messages?: estypes.AggregationsCardinalityAggregate;
  unique_users?: estypes.AggregationsCardinalityAggregate;
  credit_micro?: estypes.AggregationsSumAggregate;
};

type AgentGroupBucket = {
  key: string;
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
};

type AgentGroupAggs = {
  by_agent?: estypes.AggregationsMultiBucketAggregateBase<AgentGroupBucket>;
};

type ThumbBucket = {
  key: string;
  doc_count: number;
};

type AgentFeedbackBucket = {
  key: string;
  feedbacks?: {
    by_direction?: estypes.AggregationsMultiBucketAggregateBase<ThumbBucket>;
  };
};

type AgentFeedbackAggs = {
  by_agent?: estypes.AggregationsMultiBucketAggregateBase<AgentFeedbackBucket>;
};

type GroupUsage = {
  groupId: string;
  groupName: string;
  messages: number;
  users: number;
  credits: number;
};

async function fetchGroupUsageByAgent(
  auth: Authenticator,
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Map<string, GroupUsage[]>> {
  const esResult = await searchConsumptionAnalytics<never, AgentGroupAggs>(
    baseQuery,
    {
      aggregations: {
        by_agent: {
          terms: {
            field: CONSUMPTION_DIMENSION_FIELDS.agent,
            size: MAX_EXPORT_TERMS_SIZE,
          },
          aggs: {
            by_group: {
              terms: {
                field: CONSUMPTION_DIMENSION_FIELDS.group,
                size: MAX_EXPORT_TERMS_SIZE,
              },
              aggs: {
                unique_messages: uniqueMessagesCardinalityAgg(),
                unique_users: {
                  cardinality: {
                    field: CONSUMPTION_DIMENSION_FIELDS.user,
                    precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
                  },
                },
                credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
              },
            },
          },
        },
      },
      size: 0,
    }
  );

  if (esResult.isErr()) {
    throw new Error(
      `Failed to aggregate group usage: ${esResult.error.message}`
    );
  }

  const agentBuckets = bucketsToArray<AgentGroupBucket>(
    esResult.value.aggregations?.by_agent?.buckets
  );

  const groupIds = new Set(
    agentBuckets.flatMap((agentBucket) =>
      bucketsToArray<GroupBucket>(agentBucket.by_group?.buckets).map((g) =>
        String(g.key)
      )
    )
  );
  const groupLabels = await resolveDimensionLabels(auth, "group", [
    ...groupIds,
  ]);

  return new Map(
    agentBuckets.map((agentBucket) => [
      String(agentBucket.key),
      bucketsToArray<GroupBucket>(agentBucket.by_group?.buckets)
        .map((groupBucket) => ({
          groupId: String(groupBucket.key),
          groupName:
            groupLabels.get(String(groupBucket.key))?.name ??
            String(groupBucket.key),
          messages: Math.round(groupBucket.unique_messages?.value ?? 0),
          users: Math.round(groupBucket.unique_users?.value ?? 0),
          credits: Math.round(
            microCreditsToCredits(groupBucket.credit_micro?.value ?? 0)
          ),
        }))
        .sort((a, b) => b.messages - a.messages),
    ])
  );
}

async function fetchFeedbacksByAgent(
  workspaceId: string,
  days: number
): Promise<Map<string, { up: number; down: number }>> {
  const esResult = await searchAnalytics<never, AgentFeedbackAggs>(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspaceId } },
          { range: { timestamp: { gte: `now-${days}d/d` } } },
        ],
      },
    },
    {
      aggregations: {
        by_agent: {
          terms: { field: "agent_id", size: MAX_EXPORT_TERMS_SIZE },
          aggs: {
            feedbacks: {
              nested: { path: "feedbacks" },
              aggs: {
                by_direction: {
                  terms: { field: "feedbacks.thumb_direction", size: 5 },
                },
              },
            },
          },
        },
      },
      size: 0,
    }
  );

  if (esResult.isErr()) {
    throw new Error(`Failed to aggregate feedbacks: ${esResult.error.message}`);
  }

  return new Map(
    bucketsToArray<AgentFeedbackBucket>(
      esResult.value.aggregations?.by_agent?.buckets
    ).map((agentBucket) => {
      const directions = bucketsToArray<ThumbBucket>(
        agentBucket.feedbacks?.by_direction?.buckets
      );
      const countFor = (direction: string) =>
        directions.find((d) => String(d.key) === direction)?.doc_count ?? 0;
      return [
        String(agentBucket.key),
        { up: countFor("up"), down: countFor("down") },
      ];
    })
  );
}

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId",
    },
    days: {
      type: "number",
      default: 30,
      description: "Usage window, in days",
    },
    outputFile: {
      type: "string",
      description: "Output path (defaults to ./agents_<wId>.json)",
    },
  },
  async ({ wId, days, outputFile }, logger) => {
    const workspace = await WorkspaceResource.fetchById(wId);
    if (!workspace) {
      throw new Error(`Workspace ${wId} not found.`);
    }
    const auth = await Authenticator.internalAdminForWorkspace(wId);

    const agentConfigurations = await getAgentConfigurationsForView({
      auth,
      agentsGetView: "admin_internal",
      variant: "light",
      dangerouslySkipPermissionFiltering: true,
    });

    const baseQuery = await buildDaysConsumptionScopeQuery(auth, days);

    const usageRowsRes = await fetchAgentExportRows(baseQuery, auth, true);
    if (usageRowsRes.isErr()) {
      throw usageRowsRes.error;
    }
    const usageByAgent = new Map(
      usageRowsRes.value.map((row) => [row.agentId, row])
    );

    const [groupUsageByAgent, feedbacksByAgent, editorsByAgent] =
      await Promise.all([
        fetchGroupUsageByAgent(auth, baseQuery),
        fetchFeedbacksByAgent(wId, days),
        getAgentsEditors(auth, agentConfigurations),
      ]);

    const authors = await getAuthors(agentConfigurations);
    const authorById = new Map(authors.map((a) => [a.id, a]));

    const spaces = await SpaceResource.fetchByIds(auth, [
      ...new Set(agentConfigurations.flatMap((a) => a.requestedSpaceIds)),
    ]);
    const spaceById = new Map(spaces.map((s) => [s.sId, s]));

    const isPod = (sId: string) => spaceById.get(sId)?.isProject() ?? false;
    const nonPodSpaceIdsFor = (spaceIds: string[]) =>
      spaceIds.filter((sId) => spaceById.has(sId) && !isPod(sId));
    const podSpaceIdsFor = (spaceIds: string[]) => spaceIds.filter(isPod);

    const unresolvedSpaceAgents = agentConfigurations.filter((agent) =>
      agent.requestedSpaceIds.some((sId) => !spaceById.has(sId))
    );
    if (unresolvedSpaceAgents.length > 0) {
      logger.warn(
        {
          agentCount: unresolvedSpaceAgents.length,
          agentIds: unresolvedSpaceAgents.map((a) => a.sId).slice(0, 20),
        },
        "Agents reference spaces that could not be resolved"
      );
    }

    const agents = agentConfigurations.map((agent) => {
      const usage = usageByAgent.get(agent.sId);
      const feedbacks = feedbacksByAgent.get(agent.sId);

      return {
        sId: agent.sId,
        name: agent.name,
        description: agent.description,
        instructions: agent.instructions,
        scope: agent.scope,
        status: agent.status,
        tags: agent.tags.map((t) => t.name),
        templateId: agent.templateId,
        author: agent.versionAuthorId
          ? (authorById.get(agent.versionAuthorId)?.email ?? null)
          : null,
        editors: (editorsByAgent[agent.sId] ?? []).map((u) => u.email),
        requestedSpaceIds: agent.requestedSpaceIds,
        spaces: agent.requestedSpaceIds.map((sId) => ({
          sId,
          name: spaceById.get(sId)?.name ?? null,
          kind: spaceById.get(sId)?.kind ?? null,
        })),
        nonPodSpaceIds: nonPodSpaceIdsFor(agent.requestedSpaceIds),
        nonPodSpaceCount: nonPodSpaceIdsFor(agent.requestedSpaceIds).length,
        podSpaceIds: podSpaceIdsFor(agent.requestedSpaceIds),
        usage: {
          periodDays: days,
          messages: usage?.messages ?? 0,
          conversations: usage?.distinctConversations ?? 0,
          users: usage?.distinctUsersReached ?? 0,
          credits: usage?.credits ?? 0,
          feedbacksUp: feedbacks?.up ?? 0,
          feedbacksDown: feedbacks?.down ?? 0,
          byGroup: groupUsageByAgent.get(agent.sId) ?? [],
        },
      };
    });

    agents.sort((a, b) => b.usage.messages - a.usage.messages);

    const output = {
      workspaceId: wId,
      workspaceName: workspace.name,
      generatedAt: new Date().toISOString(),
      usagePeriodDays: days,
      agentCount: agents.length,
      agents,
    };

    const path = outputFile ?? `./agents_${wId}.json`;
    await fs.promises.writeFile(path, JSON.stringify(output, null, 2), "utf-8");

    logger.info({ path, agentCount: agents.length }, "Agents exported");
  }
);
