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
  | "personal_credit_usage"
  | "poke_credit_usage"
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
 * Call sites that download an analytics dataset under this helper's `AnalyticsExportName`
 * values (`analytics_table`, `automations`, `consumption_lines`, `credit_usage`,
 * `personal_credit_usage`, `poke_credit_usage`, `programmatic_cost`,
 * `workspace_usage_legacy`) MUST invoke this after the downloadable payload is produced and
 * before the response returns. That includes workspace AWU/credit-usage CSV, personal
 * my-usage CSV (`front-api/routes/w/[wId]/credits/my-usage-analytics.ts`), and poke
 * credit-usage CSV (`front-api/routes/poke/workspaces/[wId]/analytics/awu-usage-analytics.ts`).
 * Interactive in-app JSON chart/API responses (for example AWU/credit-usage `format=json` and
 * automations `format=json`) MUST NOT call it. Schedule/status-only handlers MUST NOT call it.
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
