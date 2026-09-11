import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";

export type AnalyticsExportName =
  | "analytics_table"
  | "automations"
  | "consumption_lines"
  | "credit_usage"
  | "programmatic_cost"
  | "workspace_usage_legacy";

export type AnalyticsExportParams = {
  exportName: AnalyticsExportName;
  format: "csv" | "json";
  dataset?: string;
  fileName?: string;
  rowCount?: number;
  period?: { start: string; end: string };
  query?: Record<string, string | number | boolean | undefined>;
};

/**
 * @cc [label:audit-logging;security] analytics-export-audited-at-egress
 * Workspace analytics **download / export** handlers (CSV or explicit file/JSON export of a
 * bulk table) MUST call this after the dataset is successfully produced and before returning
 * the response. Interactive JSON chart/API responses that power in-app analytics views are
 * not exports and MUST NOT call it. Personal my-usage downloads and poke/admin export routes
 * are out of scope for this helper. Handlers that only schedule or inspect an export MUST NOT
 * call it; the handler that hands the downloadable dataset (or a signed URL to it) to the
 * caller is the single emit point for that export.
 */
export async function emitAnalyticsExportedEvent(
  auth: Authenticator,
  params: AnalyticsExportParams
): Promise<void> {
  const metadata: Record<string, string> = {
    export_name: params.exportName,
    format: params.format,
  };
  if (params.dataset !== undefined) {
    metadata.dataset = params.dataset;
  }
  if (params.fileName !== undefined) {
    metadata.file_name = params.fileName;
  }
  if (params.rowCount !== undefined) {
    metadata.row_count = String(params.rowCount);
  }
  if (params.period) {
    metadata.period_start = params.period.start;
    metadata.period_end = params.period.end;
  }
  if (params.query) {
    const exportQuery = Object.entries(params.query)
      .filter(
        (entry): entry is [string, string | number | boolean] =>
          entry[1] !== undefined
      )
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    if (exportQuery) {
      metadata.export_query = exportQuery;
    }
  }

  return emitAuditLogEvent({
    auth,
    action: "analytics.exported",
    targets: [buildAuditLogTarget("workspace", auth.getNonNullableWorkspace())],
    context: getAuditLogContext(auth),
    metadata,
  });
}
