import { once } from "node:events";
import type { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import type { DimensionLabel } from "@app/lib/api/analytics/consumption/labels";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import { buildConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/scope";
import {
  roundToTwoDecimals,
  sanitizeCsvCell,
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
import type { Stringifier } from "csv-stringify";
import { stringify } from "csv-stringify";

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

// Caches resolved labels across pages so concurrent slices don't each re-resolve the
// same recurring agent/user/tool/etc. ids, while still never needing the full document
// set in memory to dedupe ids upfront.
class ConsumptionLabelCache {
  private readonly cachesByDimension = new Map<
    ConsumptionScopeDimension,
    Map<string, DimensionLabel>
  >();

  async resolve(
    auth: Authenticator,
    dimension: ConsumptionScopeDimension,
    keys: string[]
  ): Promise<Map<string, DimensionLabel>> {
    let cache = this.cachesByDimension.get(dimension);
    if (!cache) {
      cache = new Map();
      this.cachesByDimension.set(dimension, cache);
    }

    const missingKeys = [...new Set(keys)].filter((key) => !cache?.has(key));
    if (missingKeys.length > 0) {
      const resolved = await resolveDimensionLabels(
        auth,
        dimension,
        missingKeys
      );
      for (const [key, label] of resolved) {
        cache.set(key, label);
      }
    }

    return cache;
  }
}

// Waits for the stringifier's internal buffer to drain before writing more, so a slow
// downstream (gzip + GCS upload) applies backpressure to the ES fetch loops instead of
// having them buffer unboundedly many pages in memory.
async function writeCsvRows(
  stringifier: Stringifier,
  rows: (string | number)[][]
): Promise<void> {
  for (const row of rows) {
    if (!stringifier.write(row)) {
      await once(stringifier, "drain");
    }
  }
}

async function buildConsumptionLineExportRowsForPage(
  auth: Authenticator,
  labelCache: ConsumptionLabelCache,
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
    labelCache.resolve(
      auth,
      "agent",
      docs.map((doc) => doc.agent.id)
    ),
    labelCache.resolve(
      auth,
      "user",
      removeNulls(docs.map((doc) => doc.user?.id))
    ),
    labelCache.resolve(
      auth,
      "model",
      removeNulls(docs.map((doc) => doc.model?.model_id))
    ),
    labelCache.resolve(
      auth,
      "tool",
      removeNulls(docs.map((doc) => doc.tool?.server_name))
    ),
    labelCache.resolve(
      auth,
      "skill",
      docs.flatMap((doc) => doc.tool?.attributed_skill_ids ?? [])
    ),
    labelCache.resolve(
      auth,
      "group",
      docs.flatMap((doc) => doc.user?.group_ids ?? [])
    ),
    labelCache.resolve(
      auth,
      "source",
      removeNulls(docs.map((doc) => doc.context_origin))
    ),
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

function consumptionLineExportRowToCsvValues(
  row: ConsumptionLineExportRow
): (string | number)[] {
  return CONSUMPTION_LINE_EXPORT_HEADERS.map((header) =>
    sanitizeCsvCell(row[header])
  );
}

// Exports every raw consumption line as a gzip-compressed CSV stream, written directly to
// `destination`. Slices are fetched concurrently against a shared point-in-time, so every
// slice/page sees the same snapshot of the index instead of racing concurrent writes/refreshes
// (which could otherwise duplicate or drop rows), and streamed to `destination` as soon as each
// page is built, so memory usage stays bounded by the number of in-flight pages
// (EXPORT_SLICE_COUNT) rather than growing with the size of the export.
//
// Elasticsearch requires every request of a sliced PIT search to use the same PIT id, so pages
// are fetched in lockstep rounds: one page per still-active slice per round, all against the
// same PIT id, with the id advanced to the latest value returned before the next round starts.
export async function streamConsumptionLinesExportCsvGz(
  auth: Authenticator,
  {
    period,
    filter,
  }: {
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
  },
  destination: Writable
): Promise<Result<undefined, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const stringifier = stringify({ header: false });
  stringifier.write(CONSUMPTION_LINE_EXPORT_HEADERS);

  const uploadDone = pipeline(stringifier, zlib.createGzip(), destination);

  const pitResult = await openPointInTime(
    CONSUMPTION_ANALYTICS_ALIAS_NAME,
    EXPORT_PIT_KEEP_ALIVE
  );
  if (pitResult.isErr()) {
    stringifier.destroy(pitResult.error);
    await uploadDone.catch(() => {});
    return pitResult;
  }
  let currentPitId = pitResult.value;

  try {
    const labelCache = new ConsumptionLabelCache();
    const sliceIds = Array.from({ length: EXPORT_SLICE_COUNT }, (_, id) => id);
    const searchAfterBySlice = new Map<number, estypes.SortResults>();
    const exhaustedSlices = new Set<number>();

    while (exhaustedSlices.size < sliceIds.length) {
      const activeSliceIds = sliceIds.filter((id) => !exhaustedSlices.has(id));
      const roundPitId = currentPitId;

      const results = await concurrentExecutor(
        activeSliceIds,
        (id) =>
          searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>(
            query,
            {
              size: EXPORT_PAGE_SIZE,
              sort: CONSUMPTION_EXPORT_SORT,
              search_after: searchAfterBySlice.get(id),
              slice: { id: String(id), max: EXPORT_SLICE_COUNT },
              pit: { id: roundPitId, keep_alive: EXPORT_PIT_KEEP_ALIVE },
            }
          ),
        { concurrency: EXPORT_SLICE_COUNT }
      );

      for (let i = 0; i < activeSliceIds.length; i++) {
        const result = results[i];
        if (result.isErr()) {
          // Abort the pipeline instead of calling stringifier.end(): the upload must not
          // complete with a truncated file that looks like a full export.
          stringifier.destroy(result.error);
          await uploadDone.catch(() => {});
          return result;
        }

        const { hits } = result.value.hits;
        const docs = removeNulls(hits.map((hit) => hit._source ?? null));
        if (docs.length > 0) {
          const rows = await buildConsumptionLineExportRowsForPage(
            auth,
            labelCache,
            docs
          );
          await writeCsvRows(
            stringifier,
            rows.map(consumptionLineExportRowToCsvValues)
          );
        }

        // A pit search can return a refreshed pit_id; every slice's next round must use it.
        currentPitId = result.value.pit_id ?? currentPitId;

        const sliceId = activeSliceIds[i];
        const lastSort = hits[hits.length - 1]?.sort;
        if (hits.length < EXPORT_PAGE_SIZE || !lastSort) {
          exhaustedSlices.add(sliceId);
        } else {
          searchAfterBySlice.set(sliceId, lastSort);
        }
      }
    }

    stringifier.end();
    await uploadDone;

    return new Ok(undefined);
  } finally {
    const closeResult = await closePointInTime(currentPitId);
    if (closeResult.isErr()) {
      logger.error(
        { err: closeResult.error },
        "[ConsumptionExport] Failed to close point-in-time."
      );
    }
  }
}
