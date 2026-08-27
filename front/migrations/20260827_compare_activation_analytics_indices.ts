/**
 * Compare activation results from the legacy analytics index with the new
 * consumption analytics index. This script is read-only; `--execute` only
 * suppresses the standard migration dry-run warning.
 *
 * NODE_ENV=development npx tsx migrations/20260827_compare_activation_analytics_indices.ts \
 *   --workspaceId <workspace-sId> --days 28 --execute
 */

import { INTERACTIVE_CONTENT_SERVER_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { RUN_AGENT_SERVER_NAME } from "@app/lib/api/actions/servers/run_agent/metadata";
import { computeActivationFromCells } from "@app/lib/api/activation/evaluator";
import type { UserDayCell } from "@app/lib/api/activation/evaluator";
import {
  ANALYTICS_ALIAS_NAME,
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  getClient,
} from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { TOOL_COST_CATEGORY_AWU_WEIGHTS } from "@app/lib/metronome/events";
import { makeScript } from "@app/scripts/helpers";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { estypes } from "@elastic/elasticsearch";
import { subDays } from "date-fns";

const COMPOSITE_PAGE_SIZE = 1_000;
const DEFAULT_WINDOW_DAYS = 28;
const DEFAULT_MAX_DIFFERENCES = 50;
const DAILY_ACTIVE_USER_ORIGINS = USER_USAGE_ORIGINS.filter(
  (origin) => origin !== "triggered"
);
const ADVANCED_TOOL_CREDIT_AMOUNT_MICRO = roundCreditsToMicroCredits(
  TOOL_COST_CATEGORY_AWU_WEIGHTS.advanced
);

interface CompositeDayBucket {
  key: { user_id: string; day: number };
  dau?: { doc_count: number };
  hvuc_signal?: { doc_count: number };
}

interface UserDayCellsAggregations {
  by_user_day?: {
    after_key?: { user_id: string; day: number };
    buckets: CompositeDayBucket[];
  };
}

async function fetchIndexUserDayCells({
  additionalFilters,
  dauFilter,
  hvucFilter,
  index,
  timestampField,
  userField,
  userIds,
  windowEnd,
  windowStart,
  workspaceId,
}: {
  additionalFilters: estypes.QueryDslQueryContainer[];
  dauFilter: estypes.QueryDslQueryContainer;
  hvucFilter: estypes.QueryDslQueryContainer;
  index: string;
  timestampField: string;
  userField: string;
  userIds: string[];
  windowEnd: Date;
  windowStart: Date;
  workspaceId: string;
}): Promise<UserDayCell[]> {
  const client = await getClient();
  const cells: UserDayCell[] = [];
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        ...(userIds.length > 0 ? [{ terms: { [userField]: userIds } }] : []),
        { terms: { context_origin: USER_USAGE_ORIGINS } },
        {
          range: {
            [timestampField]: {
              gte: windowStart.toISOString(),
              lt: windowEnd.toISOString(),
            },
          },
        },
        ...additionalFilters,
      ],
    },
  };

  let afterKey: { user_id: string; day: number } | undefined;
  do {
    const response = await client.search<never, UserDayCellsAggregations>({
      index,
      query,
      size: 0,
      aggs: {
        by_user_day: {
          composite: {
            size: COMPOSITE_PAGE_SIZE,
            sources: [
              { user_id: { terms: { field: userField } } },
              {
                day: {
                  date_histogram: {
                    field: timestampField,
                    calendar_interval: "1d",
                    time_zone: "UTC",
                  },
                },
              },
            ],
            ...(afterKey ? { after: afterKey } : {}),
          },
          aggs: {
            dau: { filter: dauFilter },
            hvuc_signal: { filter: hvucFilter },
          },
        },
      },
    });

    const aggregation = response.aggregations?.by_user_day;
    const buckets = aggregation?.buckets ?? [];
    cells.push(
      ...buckets.map((bucket) => ({
        userId: bucket.key.user_id,
        dayMs: bucket.key.day,
        isDau: (bucket.dau?.doc_count ?? 0) > 0,
        isHvuc: (bucket.hvuc_signal?.doc_count ?? 0) > 0,
      }))
    );
    afterKey = buckets.length > 0 ? aggregation?.after_key : undefined;
  } while (afterKey);

  return cells;
}

function cellKey(cell: Pick<UserDayCell, "dayMs" | "userId">): string {
  return `${cell.userId}:${cell.dayMs}`;
}

function cellSummary(cell: UserDayCell | undefined) {
  return cell
    ? {
        userId: cell.userId,
        date: new Date(cell.dayMs).toISOString().slice(0, 10),
        isDau: cell.isDau,
        isHvuc: cell.isHvuc,
      }
    : null;
}

function activationByUser(cells: UserDayCell[]) {
  const cellsByUser = new Map<string, UserDayCell[]>();
  for (const cell of cells) {
    const userCells = cellsByUser.get(cell.userId) ?? [];
    userCells.push(cell);
    cellsByUser.set(cell.userId, userCells);
  }

  return new Map(
    [...cellsByUser].map(([userId, userCells]) => {
      const result = computeActivationFromCells(userCells);
      return [
        userId,
        {
          activated: result.activated,
          hvucDays: result.hvucDays,
          hvucWeeks: result.hvucWeeks,
        },
      ];
    })
  );
}

function parseEndDate(endDate: string | undefined): Date {
  const parsed = endDate ? new Date(endDate) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid endDate: ${endDate}`);
  }
  return parsed;
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      demandOption: true,
      description: "Workspace sId to compare.",
      type: "string" as const,
    },
    days: {
      default: DEFAULT_WINDOW_DAYS,
      description: "Trailing window size in days.",
      type: "number" as const,
    },
    endDate: {
      description: "Exclusive ISO end date. Defaults to now.",
      type: "string" as const,
    },
    userIds: {
      default: [],
      description: "Optional user sIds to restrict the comparison.",
      type: "array" as const,
    },
    maxDifferences: {
      default: DEFAULT_MAX_DIFFERENCES,
      description: "Maximum differences to include in the output.",
      type: "number" as const,
    },
  },
  async ({ days, endDate, maxDifferences, userIds, workspaceId }, logger) => {
    if (!Number.isInteger(days) || days <= 0) {
      throw new Error("days must be a positive integer");
    }
    if (!Number.isInteger(maxDifferences) || maxDifferences < 0) {
      throw new Error("maxDifferences must be a non-negative integer");
    }

    const windowEnd = parseEndDate(endDate);
    const windowStart = subDays(windowEnd, days);
    const common = { userIds, windowEnd, windowStart, workspaceId };
    const legacyCells = await fetchIndexUserDayCells({
      ...common,
      index: ANALYTICS_ALIAS_NAME,
      userField: "user_id",
      timestampField: "timestamp",
      additionalFilters: [
        { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
      ],
      dauFilter: { terms: { context_origin: DAILY_ACTIVE_USER_ORIGINS } },
      hvucFilter: {
        nested: {
          path: "tools_used",
          query: {
            bool: {
              filter: [{ term: { "tools_used.status": "succeeded" } }],
              should: [
                {
                  range: {
                    "tools_used.cost_awu": {
                      gte: TOOL_COST_CATEGORY_AWU_WEIGHTS.advanced,
                    },
                  },
                },
                {
                  term: {
                    "tools_used.server_name": INTERACTIVE_CONTENT_SERVER_NAME,
                  },
                },
                {
                  term: { "tools_used.server_name": RUN_AGENT_SERVER_NAME },
                },
              ],
              minimum_should_match: 1,
            },
          },
        },
      },
    });
    const consumptionCells = await fetchIndexUserDayCells({
      ...common,
      index: CONSUMPTION_ANALYTICS_ALIAS_NAME,
      userField: "user.id",
      timestampField: "completed_at",
      additionalFilters: [],
      dauFilter: {
        bool: {
          filter: [
            { term: { consumption_type: "llm" } },
            { terms: { context_origin: DAILY_ACTIVE_USER_ORIGINS } },
            { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
          ],
        },
      },
      hvucFilter: {
        bool: {
          filter: [
            { term: { consumption_type: "tool" } },
            { term: { status: "succeeded" } },
          ],
          should: [
            {
              range: {
                "gross_credit_micro.direct": {
                  gte: ADVANCED_TOOL_CREDIT_AMOUNT_MICRO,
                },
              },
            },
            {
              term: {
                "tool.server_name": INTERACTIVE_CONTENT_SERVER_NAME,
              },
            },
            { term: { "tool.server_name": RUN_AGENT_SERVER_NAME } },
          ],
          minimum_should_match: 1,
        },
      },
    });

    const legacyByKey = new Map(
      legacyCells.map((cell) => [cellKey(cell), cell])
    );
    const consumptionByKey = new Map(
      consumptionCells.map((cell) => [cellKey(cell), cell])
    );
    const allCellKeys = new Set([
      ...legacyByKey.keys(),
      ...consumptionByKey.keys(),
    ]);
    const cellDifferences = [...allCellKeys].flatMap((key) => {
      const legacy = legacyByKey.get(key);
      const consumption = consumptionByKey.get(key);
      return legacy &&
        consumption &&
        legacy.isDau === consumption.isDau &&
        legacy.isHvuc === consumption.isHvuc
        ? []
        : [
            {
              legacy: cellSummary(legacy),
              consumption: cellSummary(consumption),
            },
          ];
    });

    const comparedUserIds = new Set([
      ...userIds,
      ...legacyCells.map((cell) => cell.userId),
      ...consumptionCells.map((cell) => cell.userId),
    ]);
    const legacyActivation = activationByUser(legacyCells);
    const consumptionActivation = activationByUser(consumptionCells);
    const emptyActivation = { activated: false, hvucDays: 0, hvucWeeks: 0 };
    const activationDifferences = [...comparedUserIds].flatMap((userId) => {
      const legacy = legacyActivation.get(userId) ?? emptyActivation;
      const consumption = consumptionActivation.get(userId) ?? emptyActivation;
      return legacy.activated === consumption.activated &&
        legacy.hvucDays === consumption.hvucDays &&
        legacy.hvucWeeks === consumption.hvucWeeks
        ? []
        : [{ userId, legacy, consumption }];
    });

    logger.info(
      {
        workspaceId,
        comparedUserCount: comparedUserIds.size,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        legacyCellCount: legacyCells.length,
        consumptionCellCount: consumptionCells.length,
        cellDifferenceCount: cellDifferences.length,
        qualifyingDayDifferenceCount: cellDifferences.filter(
          ({ consumption, legacy }) =>
            Boolean(legacy?.isDau && legacy.isHvuc) !==
            Boolean(consumption?.isDau && consumption.isHvuc)
        ).length,
        activationMetricsDifferenceCount: activationDifferences.length,
        activationVerdictDifferenceCount: activationDifferences.filter(
          ({ consumption, legacy }) =>
            consumption.activated !== legacy.activated
        ).length,
        samples: {
          cellDifferences: cellDifferences.slice(0, maxDifferences),
          activationDifferences: activationDifferences.slice(0, maxDifferences),
        },
      },
      "Compared activation analytics indices"
    );
  }
);
