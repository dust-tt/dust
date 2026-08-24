import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import {
  fetchConsumptionTopGroups,
  resolveConsumptionGroupLabels,
} from "@app/lib/api/analytics/consumption/top";
import {
  roundToTwoDecimals,
  rowsToCsv,
} from "@app/lib/api/analytics/csv_utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

// Same ranking the attribution table shows, exported as a flat CSV instead of
// paginated pages: one row per dimension key, ranked by gross credits.
const EXPORT_ROW_LIMIT = 1000;

export type ConsumptionExportTableRow = {
  key: string;
  name: string;
  credits: number;
  count: number;
  avgCredits: number;
  previousCredits: number | string;
};

export const CONSUMPTION_EXPORT_TABLE_HEADERS = [
  "key",
  "name",
  "credits",
  "count",
  "avgCredits",
  "previousCredits",
] as const satisfies readonly (keyof ConsumptionExportTableRow)[];

export async function fetchConsumptionDimensionExportRows(
  auth: Authenticator,
  {
    dimension,
    period,
    filter,
  }: {
    dimension: ConsumptionScopeDimension;
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionExportTableRow[], ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension,
    period,
    limit: EXPORT_ROW_LIMIT,
    filter,
  });
  if (result.isErr()) {
    return result;
  }

  const rows = await resolveConsumptionGroupLabels(
    auth,
    dimension,
    result.value.groups
  );

  return new Ok(
    rows.map((row) => ({
      key: row.key,
      name: row.name,
      credits: roundToTwoDecimals(row.credits),
      count: row.count,
      avgCredits: roundToTwoDecimals(row.avgCredits),
      previousCredits:
        row.previousCredits === null
          ? ""
          : roundToTwoDecimals(row.previousCredits),
    }))
  );
}

export function stringifyConsumptionExportTableAsCsv(
  rows: ConsumptionExportTableRow[]
): string {
  return rowsToCsv(CONSUMPTION_EXPORT_TABLE_HEADERS, rows);
}
