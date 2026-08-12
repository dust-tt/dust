import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_SCOPE_DIMENSIONS } from "@app/lib/api/analytics/consumption/scope";
import { fetchConsumptionTopAgents } from "@app/lib/api/analytics/consumption/top_agents";
import { fetchConsumptionTopGroups } from "@app/lib/api/analytics/consumption/top_groups";
import { fetchConsumptionTopModels } from "@app/lib/api/analytics/consumption/top_models";
import type { ConsumptionTopResponse } from "@app/lib/api/analytics/consumption/top_rows";
import { toConsumptionTopRows } from "@app/lib/api/analytics/consumption/top_rows";
import { fetchConsumptionTopSkills } from "@app/lib/api/analytics/consumption/top_skills";
import { fetchConsumptionTopSources } from "@app/lib/api/analytics/consumption/top_sources";
import { fetchConsumptionTopTools } from "@app/lib/api/analytics/consumption/top_tools";
import { fetchConsumptionTopUsers } from "@app/lib/api/analytics/consumption/top_users";
import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

// The attribution table caps its ranking to keep the UI readable; the export
// returns the full breakdown for the toggled dimension instead.
const CONSUMPTION_EXPORT_LIMIT = 1000;

// Backend-only: calls the actual `fetchConsumptionTop*` functions, so this
// dispatch table must not be imported from frontend code (see top_rows.ts).
const CONSUMPTION_TOP_FETCHERS: Record<
  ConsumptionScopeDimension,
  (
    auth: Authenticator,
    opts: {
      period: ConsumptionPeriod;
      limit: number;
      filter?: ConsumptionScopeFilter;
    }
  ) => Promise<Result<ConsumptionTopResponse, ElasticsearchError>>
> = {
  agent: fetchConsumptionTopAgents,
  user: fetchConsumptionTopUsers,
  group: fetchConsumptionTopGroups,
  model: fetchConsumptionTopModels,
  tool: fetchConsumptionTopTools,
  skill: fetchConsumptionTopSkills,
  source: fetchConsumptionTopSources,
};

type ConsumptionExportCsvRow = {
  dimension: ConsumptionScopeDimension;
  name: string;
  costSharePercent: number;
  credits: number;
  avgCredits: number;
};

// Credits are raw division results with long float tails (and, for very
// small values, JS's exponential notation, e.g. `5e-7`), which spreadsheet
// apps render as text rather than a number. Round to a couple of decimals so
// every numeric cell serializes as a plain, consistently-typed number.
function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

const CONSUMPTION_EXPORT_HEADERS: (keyof ConsumptionExportCsvRow)[] = [
  "dimension",
  "name",
  "costSharePercent",
  "credits",
  "avgCredits",
];

// Exports the full breakdown across every dimension in a single CSV, rather
// than just whichever tab the attribution table currently has toggled — the
// list of dimensions is small and static, so fetching them all in parallel
// is fine ([GEN7]/[BACK7]).
export async function fetchConsumptionTopExportCsv(
  auth: Authenticator,
  {
    period,
    filter,
  }: {
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<string, ElasticsearchError>> {
  const results = await Promise.all(
    CONSUMPTION_SCOPE_DIMENSIONS.map((dimension) =>
      CONSUMPTION_TOP_FETCHERS[dimension](auth, {
        period,
        limit: CONSUMPTION_EXPORT_LIMIT,
        filter,
      })
    )
  );

  const rows: ConsumptionExportCsvRow[] = [];
  for (const [index, result] of results.entries()) {
    if (result.isErr()) {
      return result;
    }

    const dimension = CONSUMPTION_SCOPE_DIMENSIONS[index];
    const { totalCredits } = result.value;
    rows.push(
      ...toConsumptionTopRows(result.value).map((row) => ({
        dimension,
        name: row.name,
        costSharePercent:
          totalCredits > 0
            ? roundToCents((row.credits / totalCredits) * 100)
            : 0,
        credits: roundToCents(row.credits),
        avgCredits: roundToCents(row.avgCredits),
      }))
    );
  }

  return new Ok(rowsToCsv(CONSUMPTION_EXPORT_HEADERS, rows));
}
