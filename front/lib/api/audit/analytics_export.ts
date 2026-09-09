import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";

export const ANALYTICS_EXPORT_NAMES = [
  "analytics_table",
  "automations",
  "consumption_lines",
  "credit_usage",
  "programmatic_cost",
  "workspace_usage_legacy",
] as const;

export type AnalyticsExportName = (typeof ANALYTICS_EXPORT_NAMES)[number];

export type AnalyticsExportParams = {
  exportName: AnalyticsExportName;
  format: "csv" | "json";
  dataset?: string;
  fileName?: string;
  rowCount?: number;
  period?: { start: string; end: string };
  query?: Record<string, string | number | boolean | undefined>;
};

function flattenExportQuery(
  query: AnalyticsExportParams["query"]
): string | undefined {
  if (!query) {
    return undefined;
  }
  const pairs = Object.entries(query)
    .filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined
    )
    .map(([key, value]) => `${key}=${value}`);
  if (pairs.length === 0) {
    return undefined;
  }
  return pairs.join("&");
}

/**
 * @cc [label:audit-logging;security] analytics-export-audited-at-egress
 * Every handler that returns a bulk analytics dataset to a caller MUST call this after the
 * dataset is successfully produced and before returning the response. Handlers that only
 * schedule or inspect an export MUST NOT call it; the handler that hands the data (or a signed
 * URL to it) to the caller is the single emit point for that dataset.
 */
export async function emitAnalyticsExportedEvent(
  auth: Authenticator,
  params: AnalyticsExportParams
): Promise<void> {
  const exportQuery = flattenExportQuery(params.query);

  void emitAuditLogEvent({
    auth,
    action: "analytics.exported",
    targets: [buildAuditLogTarget("workspace", auth.getNonNullableWorkspace())],
    context: getAuditLogContext(auth),
    metadata: {
      export_name: params.exportName,
      format: params.format,
      ...(params.dataset !== undefined ? { dataset: params.dataset } : {}),
      ...(params.fileName !== undefined ? { file_name: params.fileName } : {}),
      ...(params.rowCount !== undefined
        ? { row_count: String(params.rowCount) }
        : {}),
      ...(params.period
        ? {
            period_start: params.period.start,
            period_end: params.period.end,
          }
        : {}),
      ...(exportQuery ? { export_query: exportQuery } : {}),
    },
  });
}
