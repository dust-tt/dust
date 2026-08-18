import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { buildConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/scope";
import {
  roundToTwoDecimals,
  rowsToCsv,
} from "@app/lib/api/analytics/csv_utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  closePointInTime,
  openPointInTime,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";
import AdmZip from "adm-zip";

// Exported for tests to exercise pagination/slicing boundaries without duplicating the values.
export const EXPORT_PAGE_SIZE = 10_000;
// Fetches slices concurrently instead of paginating one page at a time.
// Trades higher peak memory (one in-flight page per slice) for lower wall-clock time.
export const EXPORT_SLICE_COUNT = 3;
// Long enough to cover a full export (all slices, fully paginated); refreshed on every
// request so it only needs to outlive the gap between two consecutive page fetches.
const EXPORT_PIT_KEEP_ALIVE = "5m";

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

const CONSUMPTION_EXPORT_SORT: estypes.Sort = [
  { completed_at: "asc" },
  { agent_message_id: "asc" },
  { consumption_key: "asc" },
];

function compareConsumptionExportRows(
  a: AgentMessageConsumptionAnalyticsData,
  b: AgentMessageConsumptionAnalyticsData
): number {
  return (
    a.completed_at.localeCompare(b.completed_at) ||
    a.agent_message_id.localeCompare(b.agent_message_id) ||
    a.consumption_key.localeCompare(b.consumption_key)
  );
}

// Fetches one slice of the sliced-search partition to completion, paginating
// within the slice with search_after against the shared point-in-time.
async function fetchConsumptionSliceDocuments(
  query: estypes.QueryDslQueryContainer,
  slice: estypes.SlicedScroll,
  pitId: string
): Promise<Result<AgentMessageConsumptionAnalyticsData[], ElasticsearchError>> {
  const sliceDocs: AgentMessageConsumptionAnalyticsData[] = [];
  let searchAfter: estypes.SortResults | undefined;
  let currentPitId = pitId;
  let hitCount: number;

  do {
    const result =
      await searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>(
        query,
        {
          size: EXPORT_PAGE_SIZE,
          sort: CONSUMPTION_EXPORT_SORT,
          search_after: searchAfter,
          slice,
          pit: { id: currentPitId, keep_alive: EXPORT_PIT_KEEP_ALIVE },
        }
      );

    if (result.isErr()) {
      return result;
    }

    const { hits } = result.value.hits;
    for (const hit of hits) {
      if (hit._source) {
        sliceDocs.push(hit._source);
      }
    }

    // A pit search can return a refreshed pit_id; subsequent pages must use it.
    currentPitId = result.value.pit_id ?? currentPitId;
    hitCount = hits.length;
    searchAfter = hits[hits.length - 1]?.sort;
  } while (hitCount === EXPORT_PAGE_SIZE);

  return new Ok(sliceDocs);
}

// One document per unit of billed credit consumption. Slices are fetched concurrently against
// a shared point-in-time, so every slice/page sees the same snapshot of the index instead of
// racing concurrent writes/refreshes (which could otherwise duplicate or drop rows).
async function fetchAllConsumptionDocuments(
  query: estypes.QueryDslQueryContainer
): Promise<Result<AgentMessageConsumptionAnalyticsData[], ElasticsearchError>> {
  const pitResult = await openPointInTime(
    CONSUMPTION_ANALYTICS_ALIAS_NAME,
    EXPORT_PIT_KEEP_ALIVE
  );
  if (pitResult.isErr()) {
    return pitResult;
  }
  const pitId = pitResult.value;

  try {
    const sliceIds = Array.from({ length: EXPORT_SLICE_COUNT }, (_, id) => id);

    const results = await concurrentExecutor(
      sliceIds,
      (id) =>
        fetchConsumptionSliceDocuments(
          query,
          { id: String(id), max: EXPORT_SLICE_COUNT },
          pitId
        ),
      { concurrency: EXPORT_SLICE_COUNT }
    );

    const allDocs: AgentMessageConsumptionAnalyticsData[] = [];
    for (const result of results) {
      if (result.isErr()) {
        return result;
      }
      for (const doc of result.value) {
        allDocs.push(doc);
      }
    }

    // Each slice is individually sorted; merge back into a single global order.
    allDocs.sort(compareConsumptionExportRows);

    return new Ok(allDocs);
  } finally {
    const closeResult = await closePointInTime(pitId);
    if (closeResult.isErr()) {
      logger.error(
        { err: closeResult.error },
        "[ConsumptionExport] Failed to close point-in-time."
      );
    }
  }
}

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
      creditsSystem: roundToTwoDecimals(
        microCreditsToCredits(gross.system ?? 0)
      ),
      creditsInput: roundToTwoDecimals(microCreditsToCredits(gross.input ?? 0)),
      creditsOutput: roundToTwoDecimals(
        microCreditsToCredits(gross.output ?? 0)
      ),
      creditsReasoning: roundToTwoDecimals(
        microCreditsToCredits(gross.reasoning ?? 0)
      ),
      creditsDirect: roundToTwoDecimals(
        microCreditsToCredits(gross.direct ?? 0)
      ),
      totalCredits: roundToTwoDecimals(microCreditsToCredits(doc.credit_micro)),
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
