import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import {
  CONSUMPTION_DIMENSION_UNIT,
  CONSUMPTION_SCOPE_DIMENSIONS,
} from "@app/lib/api/analytics/consumption/scope";
import {
  fetchConsumptionAllGroups,
  resolveConsumptionGroupLabels,
} from "@app/lib/api/analytics/consumption/top";
import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

type ConsumptionExportCsvRow = {
  dimension: ConsumptionScopeDimension;
  name: string;
  costSharePercent: number;
  credits: number;
  avgCredits: number;
};

// Credits are raw division results with long float tails which spreadsheet
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

// Exports the full breakdown across every dimension in a single CSV
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
      fetchConsumptionAllGroups(auth, {
        dimension,
        unit: CONSUMPTION_DIMENSION_UNIT[dimension],
        period,
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
    const { groups, totalCredits } = result.value;
    const resolvedRows = await resolveConsumptionGroupLabels(
      auth,
      dimension,
      groups
    );

    rows.push(
      ...resolvedRows.map((row) => ({
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
