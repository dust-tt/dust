import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import {
  formatUpgradeRequestDate,
  UPGRADE_REQUEST_REASON_LABEL,
  upgradeRequestGrant,
  upgradeRequestGrantedLabel,
  upgradeRequestStatusLabel,
  upgradeRequestUntilLabel,
} from "@app/lib/api/credits/upgrade_requests_display";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";

// Mirrors what the History tab's table actually renders
// not the raw request fields to avoid confusing the user
export interface UpgradeRequestExportRow {
  requesterName: string;
  requesterEmail: string;
  requestedAt: string;
  granted: string;
  until: string;
  reason: string;
  status: string;
  resolvedAt: string;
  resolvedBy: string;
}

export const UPGRADE_REQUEST_EXPORT_HEADERS: (keyof UpgradeRequestExportRow)[] =
  [
    "requesterName",
    "requesterEmail",
    "requestedAt",
    "granted",
    "until",
    "reason",
    "status",
    "resolvedAt",
    "resolvedBy",
  ];

function formatDateOrEmpty(epochMs: number | null): string {
  return epochMs === null ? "—" : formatUpgradeRequestDate(epochMs);
}

export function toUpgradeRequestExportRow(
  request: MembershipUpgradeRequestType
): UpgradeRequestExportRow {
  return {
    requesterName: request.requester.name,
    requesterEmail: request.requester.email ?? "",
    requestedAt: formatUpgradeRequestDate(request.createdAt),
    granted: upgradeRequestGrantedLabel(upgradeRequestGrant(request)),
    until: upgradeRequestUntilLabel(request),
    reason: request.reason || UPGRADE_REQUEST_REASON_LABEL,
    status: upgradeRequestStatusLabel(request.status),
    resolvedAt: formatDateOrEmpty(request.resolvedAt),
    resolvedBy: request.resolvedBy?.name ?? "—",
  };
}

export function upgradeRequestsToCsv(
  requests: MembershipUpgradeRequestType[]
): string {
  return rowsToCsv(
    UPGRADE_REQUEST_EXPORT_HEADERS,
    requests.map(toUpgradeRequestExportRow)
  );
}
