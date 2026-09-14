/**
 * Backfill `parent_message_id` on the consumption analytics index using
 * `ancestor_message_ids` from the analytics index.
 *
 * Join: agent_message_consumption_analytics.agent_message_id == agent_message_analytics.message_id
 * Value: ancestor_message_ids[0] → parent_message_id
 *
 * Dry run (counts only):
 *   npx tsx scripts/backfill_parent_message_id_es.ts \
 *     --fromDate 2026-08-01T00:00:00.000Z
 *
 * Execute:
 *   npx tsx scripts/backfill_parent_message_id_es.ts \
 *     --fromDate 2026-08-01T00:00:00.000Z \
 *     --execute
 */
import {
  ANALYTICS_ALIAS_NAME,
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  getClient,
} from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";
import assert from "assert";
import { z } from "zod";
import { fromError } from "zod-validation-error";

interface AnalyticsSourceDoc {
  message_id: string;
  ancestor_message_ids: string[];
}

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_REQUESTS_PER_SECOND = 1000;

const TimestampSchema = z.string().datetime({ offset: true });

function parseTimestamp(value: string, argumentName: string): Date {
  const result = TimestampSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid --${argumentName}: ${fromError(result.error).toString()}`
    );
  }

  return new Date(result.data);
}

makeScript(
  {
    fromDate: {
      type: "string",
      required: true,
      description:
        "Inclusive ISO-8601 timestamp — only analytics docs with timestamp >= this are considered.",
    },
    toDate: {
      type: "string",
      required: false,
      description: "Exclusive ISO-8601 timestamp (defaults to script start).",
    },
    requestsPerSecond: {
      type: "number",
      default: DEFAULT_REQUESTS_PER_SECOND,
      description: "Throttle for _update_by_query (docs/sec). ",
    },
    batchSize: {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      description: "Batch size for _search (docs).",
    },
  },
  async (
    { execute, fromDate, toDate, requestsPerSecond, batchSize },
    logger
  ) => {
    const parsedFromDate = parseTimestamp(fromDate, "fromDate");
    const parsedToDate = toDate ? parseTimestamp(toDate, "toDate") : new Date();
    assert(parsedFromDate < parsedToDate, "--fromDate must precede --toDate");

    const client = await getClient();

    let totalSourceDocs = 0;
    let totalDestDocs = 0;
    let totalUpdated = 0;
    let totalNoops = 0;
    let batchCount = 0;

    let searchAfter: undefined | Array<string | number>;

    while (true) {
      const response = await client.search<AnalyticsSourceDoc>({
        index: ANALYTICS_ALIAS_NAME,
        size: batchSize,
        query: {
          bool: {
            must: [{ exists: { field: "ancestor_message_ids" } }],
            filter: [
              {
                range: {
                  timestamp: {
                    gte: parsedFromDate.toISOString(),
                    lt: parsedToDate.toISOString(),
                  },
                },
              },
            ],
          },
        },
        sort: ["_doc"],
        ...(searchAfter ? { search_after: searchAfter } : {}),
        _source: ["message_id", "ancestor_message_ids"],
      });

      const hits = response.hits.hits;
      if (hits.length === 0) {
        break;
      }

      const mappings: Record<string, string> = {};
      for (const hit of hits) {
        const source = hit._source;
        if (source && source.ancestor_message_ids.length > 0) {
          mappings[source.message_id] = source.ancestor_message_ids[0];
          totalSourceDocs++;
        }
      }

      if (Object.keys(mappings).length > 0) {
        if (execute) {
          const result = await runUpdateBatch(
            client,
            mappings,
            requestsPerSecond
          );
          totalDestDocs += result.total;
          totalUpdated += result.updated;
          totalNoops += result.noops;
        }
        batchCount++;
        logger.info(
          {
            batchCount,
            totalSourceDocs,
            totalDestDocs,
            totalUpdated,
            totalNoops,
            batchSize: Object.keys(mappings).length,
          },
          "[ParentMessageIdBackfill] Batch complete"
        );
      }

      searchAfter = hits[hits.length - 1].sort as Array<string | number>;
    }

    logger.info(
      {
        fromDate: parsedFromDate.toISOString(),
        toDate: parsedToDate.toISOString(),
        totalSourceDocs,
        totalUpdated,
        totalNoops,
        batchCount,
        execute,
      },
      execute
        ? "[ParentMessageIdBackfill] Backfill complete"
        : "[ParentMessageIdBackfill] Dry run complete"
    );
  }
);

async function runUpdateBatch(
  client: InstanceType<typeof import("@elastic/elasticsearch").Client>,
  mappings: Record<string, string>,
  requestsPerSecond: number
): Promise<{ total: number; updated: number; noops: number }> {
  const messageIds = Object.keys(mappings);

  const response = await client.updateByQuery({
    index: CONSUMPTION_ANALYTICS_ALIAS_NAME,
    refresh: false,
    requests_per_second: requestsPerSecond,
    body: {
      query: {
        bool: {
          must: [{ terms: { agent_message_id: messageIds } }],
          must_not: [{ exists: { field: "parent_message_id" } }],
        },
      },
      script: {
        source:
          "def parentId = params.mapping[ctx._source.agent_message_id]; if (parentId != null) { ctx._source.parent_message_id = parentId; } else { ctx.op = 'noop'; }",
        lang: "painless",
        params: { mapping: mappings },
      },
    },
  });

  return {
    total: Number(response.total ?? 0),
    updated: Number(response.updated ?? 0),
    noops: Number(response.noops ?? 0),
  };
}
