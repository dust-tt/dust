import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";

export interface UpgradeRequestExportRow {
  requesterName: string;
  requesterEmail: string;
  status: string;
  reason: string;
  requestedAt: string;
  resolvedAt: string;
  resolvedBy: string;
  grantedCredits: string;
  grantedUnlimitedSpend: string;
  grantedSeatType: string;
  grantedExpiryKind: string;
}

export const UPGRADE_REQUEST_EXPORT_HEADERS: (keyof UpgradeRequestExportRow)[] =
  [
    "requesterName",
    "requesterEmail",
    "status",
    "reason",
    "requestedAt",
    "resolvedAt",
    "resolvedBy",
    "grantedCredits",
    "grantedUnlimitedSpend",
    "grantedSeatType",
    "grantedExpiryKind",
  ];

function toIsoStringOrEmpty(epochMs: number | null): string {
  return epochMs === null ? "" : new Date(epochMs).toISOString();
}

export function toUpgradeRequestExportRow(
  request: MembershipUpgradeRequestType
): UpgradeRequestExportRow {
  return {
    requesterName: request.requester.name,
    requesterEmail: request.requester.email ?? "",
    status: request.status,
    reason: request.reason ?? "",
    requestedAt: toIsoStringOrEmpty(request.createdAt),
    resolvedAt: toIsoStringOrEmpty(request.resolvedAt),
    resolvedBy: request.resolvedBy?.name ?? "",
    grantedCredits: request.grantedAwuCredits?.toString() ?? "",
    grantedUnlimitedSpend: request.grantedUnlimitedSpend ? "true" : "",
    grantedSeatType: request.grantedSeatType ?? "",
    grantedExpiryKind: request.grantedExpiryKind ?? "",
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
