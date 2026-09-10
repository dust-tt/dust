import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { buildConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/scope";
import {
  roundToTwoDecimals,
  rowsToCsv,
} from "@app/lib/api/analytics/csv_utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import logger from "@app/logger/logger";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

const EXPORT_PAGE_SIZE = 10_000;

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

const ES_SORT: estypes.Sort = [
  { completed_at: "asc" },
  { agent_message_id: "asc" },
  { consumption_key: "asc" },
];

// One document per unit of billed credit consumption
async function fetchAllConsumptionDocuments(
  query: estypes.QueryDslQueryContainer
): Promise<Result<AgentMessageConsumptionAnalyticsData[], ElasticsearchError>> {
  const allDocs: AgentMessageConsumptionAnalyticsData[] = [];
  let searchAfter: estypes.SortResults | undefined;
  let hitCount: number;

  do {
    const result =
      await searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>(
        query,
        {
          size: EXPORT_PAGE_SIZE,
          sort: ES_SORT,
          search_after: searchAfter,
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

    hitCount = hits.length;
    searchAfter = hits[hits.length - 1]?.sort;
  } while (hitCount === EXPORT_PAGE_SIZE);

  return new Ok(allDocs);
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
      ...new Set(docs.map((doc) => doc.agent.attributed_id)),
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
    const agentId = agent.attributed_id;
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
      agentId,
      agentName: agentLabels.get(agentId)?.name ?? agentId,
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

// Fetches and formats the consumption lines for one period (typically a bucket of a
// larger export) as CSV rows, without a header — callers assemble the final file by
// prepending the shared header.
export async function fetchConsumptionExportBucketCsv(
  auth: Authenticator,
  {
    period,
    filter,
  }: {
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<string, ElasticsearchError>> {
  const rows = await fetchConsumptionExportRows(auth, { period, filter });
  if (rows.isErr()) {
    return rows;
  }

  return new Ok(
    rowsToCsv(CONSUMPTION_LINE_EXPORT_HEADERS, rows.value, {
      includeHeader: false,
    })
  );
}

export function buildConsumptionLineExportCsvHeader(): string {
  return rowsToCsv(CONSUMPTION_LINE_EXPORT_HEADERS, []);
}

async function fetchConsumptionExportRows(
  auth: Authenticator,
  {
    period,
    filter,
  }: {
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionLineExportRow[], ElasticsearchError>> {
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
  return new Ok(rows);
}

export function rowsToNdjson(rows: ConsumptionLineExportRow[]): string {
  return (
    rows.map((row) => JSON.stringify(row)).join("\n") +
    (rows.length > 0 ? "\n" : "")
  );
}

export function rowsToCsvString(rows: ConsumptionLineExportRow[]): string {
  return rowsToCsv(CONSUMPTION_LINE_EXPORT_HEADERS, rows);
}

/**
 * Streams consumption export data page by page. The first ES page is fetched
 * eagerly: if it fails, an Err is returned so the caller can respond with a
 * proper API error. Once streaming has started (Ok), mid-stream failures are
 * appended as a raw error line (intentionally not valid CSV/NDJSON so parsers
 * break loudly) and the stream is closed.
 */
export async function streamConsumptionExport(
  auth: Authenticator,
  opts: {
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
    format: "csv" | "ndjson";
    signal?: AbortSignal;
  }
): Promise<Result<ReadableStream<Uint8Array>, ElasticsearchError>> {
  const encoder = new TextEncoder();
  const { period, filter, format, signal } = opts;

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  // Fetch the first page eagerly so failures surface as a Result before
  // the caller commits to a streaming 200 response.
  const firstResult =
    await searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>(
      query,
      { size: EXPORT_PAGE_SIZE, sort: ES_SORT }
    );

  if (firstResult.isErr()) {
    return new Err(firstResult.error);
  }

  const firstPageHits = firstResult.value.hits.hits;
  let cancelled = false;

  async function* pages(): AsyncGenerator<Uint8Array> {
    // Yield the first (already-fetched) page, then continue paginating.
    let currentHits = firstPageHits;
    let isFirst = true;

    while (true) {
      const docs: AgentMessageConsumptionAnalyticsData[] = [];
      for (const hit of currentHits) {
        if (hit._source) {
          docs.push(hit._source);
        }
      }

      const rows = await buildConsumptionLineExportRows(auth, docs);

      const chunk =
        format === "csv"
          ? rowsToCsv(CONSUMPTION_LINE_EXPORT_HEADERS, rows, {
              includeHeader: isFirst,
            })
          : rowsToNdjson(rows);

      isFirst = false;
      yield encoder.encode(chunk);

      if (currentHits.length < EXPORT_PAGE_SIZE) {
        break;
      }

      if (cancelled) {
        return;
      }
      if (signal?.aborted) {
        yield encoder.encode("ERROR: Export timed out.");
        return;
      }

      const searchAfter = currentHits[currentHits.length - 1]?.sort;
      const result =
        await searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>(
          query,
          {
            size: EXPORT_PAGE_SIZE,
            sort: ES_SORT,
            search_after: searchAfter,
          }
        );

      if (result.isErr()) {
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            startDate: period.startDate,
            endDate: period.endDate,
            filter,
            error: result.error.message,
          },
          "[Consumption Export] Failed to stream consumption lines"
        );
        yield encoder.encode("ERROR: Internal server error.");
        return;
      }

      currentHits = result.value.hits.hits;
    }
  }

  const gen = pages();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await gen.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        if (!cancelled) {
          logger.error({ err }, "[Consumption Export] Unexpected stream error");
          controller.error(normalizeError(err));
        } else {
          controller.close();
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Ok(stream);
}
