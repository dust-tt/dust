import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { buildConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/scope";
import { roundToCents, rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";
import AdmZip from "adm-zip";

const EXPORT_PAGE_SIZE = 10_000;

// One document per unit of billed credit consumption
async function fetchAllConsumptionDocuments(
  query: estypes.QueryDslQueryContainer
): Promise<Result<AgentMessageConsumptionAnalyticsData[], ElasticsearchError>> {
  const allDocs: AgentMessageConsumptionAnalyticsData[] = [];
  let searchAfter: estypes.SortResults | undefined;

  for (;;) {
    const result =
      await searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>(
        query,
        {
          size: EXPORT_PAGE_SIZE,
          sort: [
            { completed_at: "asc" },
            { agent_message_id: "asc" },
            { consumption_key: "asc" },
          ],
          search_after: searchAfter,
          source: { excludes: ["tokens"] },
        }
      );

    if (result.isErr()) {
      return result;
    }

    const { hits } = result.value.hits;
    for (const hit of hits) {
      if (hit._source) {
        allDocs.push(hit._source);
      }
    }

    if (hits.length < EXPORT_PAGE_SIZE) {
      break;
    }
    searchAfter = hits[hits.length - 1].sort;
  }

  return new Ok(allDocs);
}

type ConsumptionLineExportRow = {
  completedAt: string;
  conversationId: string;
  spaceId: string;
  agentMessageId: string;
  consumptionType: string;
  agentId: string;
  agentName: string;
  agentVersion: string;
  agentTagIds: string;
  agentRootId: string;
  agentParentId: string;
  agentDepth: number;
  modelProviderId: string;
  modelId: string;
  modelName: string;
  modelReasoningEffort: string;
  modelResolutionMethod: string;
  userId: string;
  userName: string;
  userGroupIds: string;
  userGroupNames: string;
  triggerId: string;
  contextOrigin: string;
  apiKeyName: string;
  toolName: string;
  toolServerName: string;
  toolDisplayName: string;
  toolParentServerName: string;
  toolActionId: string;
  attributedSkillIds: string;
  attributedSkillNames: string;
  creditsSystem: number;
  creditsInput: number;
  creditsOutput: number;
  creditsReasoning: number;
  creditsDirect: number;
  totalCredits: number;
  usageType: string;
  status: string;
  stepIndex: number;
  executionTimeMs: number;
};

const CONSUMPTION_LINE_EXPORT_HEADERS: (keyof ConsumptionLineExportRow)[] = [
  "completedAt",
  "conversationId",
  "spaceId",
  "agentMessageId",
  "consumptionType",
  "agentId",
  "agentName",
  "agentVersion",
  "agentTagIds",
  "agentRootId",
  "agentParentId",
  "agentDepth",
  "modelProviderId",
  "modelId",
  "modelName",
  "modelReasoningEffort",
  "modelResolutionMethod",
  "userId",
  "userName",
  "userGroupIds",
  "userGroupNames",
  "triggerId",
  "contextOrigin",
  "apiKeyName",
  "toolName",
  "toolServerName",
  "toolDisplayName",
  "toolParentServerName",
  "toolActionId",
  "attributedSkillIds",
  "attributedSkillNames",
  "creditsSystem",
  "creditsInput",
  "creditsOutput",
  "creditsReasoning",
  "creditsDirect",
  "totalCredits",
  "usageType",
  "status",
  "stepIndex",
  "executionTimeMs",
];

async function buildConsumptionLineExportRows(
  auth: Authenticator,
  docs: AgentMessageConsumptionAnalyticsData[]
): Promise<ConsumptionLineExportRow[]> {
  const [
    agentLabels,
    userLabels,
    modelLabels,
    toolLabels,
    skillLabels,
    groupLabels,
    sourceLabels,
  ] = await Promise.all([
    resolveDimensionLabels(auth, "agent", [
      ...new Set(docs.map((doc) => doc.agent.id)),
    ]),
    resolveDimensionLabels(auth, "user", [
      ...new Set(removeNulls(docs.map((doc) => doc.user?.id))),
    ]),
    resolveDimensionLabels(auth, "model", [
      ...new Set(removeNulls(docs.map((doc) => doc.model?.model_id))),
    ]),
    resolveDimensionLabels(auth, "tool", [
      ...new Set(removeNulls(docs.map((doc) => doc.tool?.server_name))),
    ]),
    resolveDimensionLabels(auth, "skill", [
      ...new Set(docs.flatMap((doc) => doc.tool?.attributed_skill_ids ?? [])),
    ]),
    resolveDimensionLabels(auth, "group", [
      ...new Set(docs.flatMap((doc) => doc.user?.group_ids ?? [])),
    ]),
    resolveDimensionLabels(auth, "source", [
      ...new Set(removeNulls(docs.map((doc) => doc.context_origin))),
    ]),
  ]);

  return docs.map((doc) => {
    const { agent, model, user, tool } = doc;
    // Older documents indexed before these buckets shipped don't carry them.
    const gross = doc.gross_credit_micro ?? {
      system: 0,
      input: null,
      result_footprint: null,
      output: null,
      reasoning: 0,
      direct: 0,
      total: 0,
    };

    return {
      completedAt: doc.completed_at,
      conversationId: doc.conversation_id,
      spaceId: doc.space_id ?? "",
      agentMessageId: doc.agent_message_id,
      consumptionType: doc.consumption_type,
      agentId: agent.id,
      agentName: agentLabels.get(agent.id)?.name ?? agent.id,
      agentVersion: agent.version ?? "",
      agentTagIds: (agent.tag_ids ?? []).join("; "),
      agentRootId: agent.root_id ?? "",
      agentParentId: agent.direct_parent_id ?? "",
      agentDepth: agent.depth ?? 0,
      modelProviderId: model?.provider_id ?? "",
      modelId: model?.model_id ?? "",
      modelName: model
        ? (modelLabels.get(model.model_id)?.name ?? model.model_id)
        : "",
      modelReasoningEffort: model?.reasoning_effort ?? "",
      modelResolutionMethod: model?.resolution_method ?? "",
      userId: user?.id ?? "",
      userName: user ? (userLabels.get(user.id)?.name ?? user.id) : "",
      userGroupIds: (user?.group_ids ?? []).join("; "),
      userGroupNames: (user?.group_ids ?? [])
        .map((id) => groupLabels.get(id)?.name ?? id)
        .join("; "),
      triggerId: doc.trigger_id ?? "",
      contextOrigin: doc.context_origin
        ? (sourceLabels.get(doc.context_origin)?.name ?? doc.context_origin)
        : "",
      apiKeyName: doc.api_key_name ?? "",
      toolName: tool?.name ?? "",
      toolServerName: tool?.server_name ?? "",
      toolDisplayName: tool
        ? (toolLabels.get(tool.server_name)?.name ?? tool.server_name)
        : "",
      toolParentServerName: tool?.parent_server_name ?? "",
      toolActionId: tool?.action_id ?? "",
      attributedSkillIds: (tool?.attributed_skill_ids ?? []).join("; "),
      attributedSkillNames: (tool?.attributed_skill_ids ?? [])
        .map((id) => skillLabels.get(id)?.name ?? id)
        .join("; "),
      creditsSystem: roundToCents(microCreditsToCredits(gross.system ?? 0)),
      creditsInput: roundToCents(microCreditsToCredits(gross.input ?? 0)),
      creditsOutput: roundToCents(microCreditsToCredits(gross.output ?? 0)),
      creditsReasoning: roundToCents(
        microCreditsToCredits(gross.reasoning ?? 0)
      ),
      creditsDirect: roundToCents(microCreditsToCredits(gross.direct ?? 0)),
      totalCredits: roundToCents(microCreditsToCredits(doc.credit_micro)),
      usageType: doc.usage_type,
      status: doc.status,
      stepIndex: doc.step_index,
      executionTimeMs: doc.execution_time_ms ?? 0,
    };
  });
}

// Exports every raw consumption under zipped csv format
export async function fetchConsumptionLinesExportZip(
  auth: Authenticator,
  {
    period,
    filter,
  }: {
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<Buffer, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const docsResult = await fetchAllConsumptionDocuments(query);
  if (docsResult.isErr()) {
    return docsResult;
  }

  const rows = await buildConsumptionLineExportRows(auth, docsResult.value);

  const zip = new AdmZip();
  zip.addFile(
    "lines.csv",
    Buffer.from(rowsToCsv(CONSUMPTION_LINE_EXPORT_HEADERS, rows), "utf-8")
  );

  return new Ok(zip.toBuffer());
}
